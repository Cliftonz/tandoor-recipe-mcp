// Unit tests for the SSRF guard.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPrivateIp,
  safeFetch,
  safeFetchBytes,
  assertPublicUrl,
  SsrfBlockedError,
  type ResolverFn,
} from '../src/lib/safe-fetch.js';
import { startStub } from './helpers/stub-http.js';

describe('isPrivateIp', () => {
  const cases: [string, boolean][] = [
    ['127.0.0.1', true],
    ['127.255.255.254', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['172.15.0.1', false],
    ['192.169.0.1', false],
    ['::1', true],
    ['::', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['2001:4860:4860::8888', false],
    ['::ffff:127.0.0.1', true],
    ['::ffff:8.8.8.8', false],
    ['not-an-ip', true],
    ['', true],
  ];
  for (const [ip, expected] of cases) {
    it(`${expected ? 'rejects' : 'allows'} ${ip || '(empty)'}`, () => {
      expect(isPrivateIp(ip)).toBe(expected);
    });
  }
});

// Helper: resolver that returns a fixed answer set. Bypasses real DNS.
function withResolver(addrs: { address: string; family: number }[]): ResolverFn {
  return async () => addrs;
}

describe('safeFetch — literal IP and scheme rejections', () => {
  it('refuses a literal loopback URL', async () => {
    await expect(safeFetch('http://127.0.0.1/x')).rejects.toThrow(SsrfBlockedError);
    await expect(safeFetch('http://127.0.0.1/x')).rejects.toThrow(/forbidden range/);
  });

  it('refuses a link-local (IMDS) URL', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/'))
      .rejects.toThrow(SsrfBlockedError);
  });

  it('refuses IPv6 loopback', async () => {
    await expect(safeFetch('http://[::1]/x')).rejects.toThrow(SsrfBlockedError);
  });

  it('refuses unsupported schemes', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/unsupported scheme/);
    await expect(safeFetch('gopher://example.com/_some')).rejects.toThrow(/unsupported scheme/);
  });

  it('refuses malformed URLs', async () => {
    await expect(safeFetch('not-a-url')).rejects.toThrow(/malformed URL/);
  });

  it('TANDOOR_MCP_ALLOW_PRIVATE_FETCH=1 allows literal loopback (test/dev opt-out)', async () => {
    const stub = await startStub((_req, res) => { res.statusCode = 200; res.end('ok'); });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      const res = await safeFetch(stub.url + '/x');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('literal IMDS IP is blocked even with TANDOOR_MCP_ALLOW_PRIVATE_FETCH=1', async () => {
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetch('http://169.254.169.254/'))
        .rejects.toThrow(/always-forbidden/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
    }
  });

  it('init.redirect cannot be overridden (caller hijack attempt throws)', async () => {
    await expect(safeFetch('https://public.example/', { redirect: 'follow' }, {
      resolver: withResolver([{ address: '8.8.8.8', family: 4 }]),
    })).rejects.toThrow(/safeFetch manages redirects/);
  });
});

describe('safeFetch — redirects', () => {
  it('rejects a redirect to a private host (per-hop re-check)', async () => {
    const stub = await startStub((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', 'http://169.254.169.254/latest/meta-data/');
      res.end();
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetch(stub.url + '/start')).rejects.toThrow(/always-forbidden/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('exceeds maxRedirects throws SsrfBlockedError', async () => {
    let hops = 0;
    const stub = await startStub((_req, res) => {
      hops++;
      res.statusCode = 302;
      res.setHeader('Location', `/next-${hops}`);
      res.end();
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetch(stub.url + '/start', {}, { maxRedirects: 2 }))
        .rejects.toThrow(/exceeded 2 redirects/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('default maxRedirects=5 cap is enforced when not overridden', async () => {
    let hops = 0;
    const stub = await startStub((_req, res) => {
      hops++;
      res.statusCode = 302;
      res.setHeader('Location', `/next-${hops}`);
      res.end();
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetch(stub.url + '/start'))
        .rejects.toThrow(/exceeded 5 redirects/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('3xx without Location returns the response as-is (no follow, no throw)', async () => {
    const stub = await startStub((_req, res) => {
      res.statusCode = 302;
      // intentionally omit Location header
      res.setHeader('content-type', 'text/plain');
      res.end('intentionally missing');
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      const res = await safeFetch(stub.url + '/x');
      expect(res.status).toBe(302);
      expect(await res.text()).toBe('intentionally missing');
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('protocol-relative redirect resolves and re-validates (rebind to IMDS blocked)', async () => {
    // Public hop redirects to //169.254.169.254/ which the URL spec
    // resolves relative to the current scheme. The always-forbidden check
    // fires regardless of opt-out.
    const resolver = withResolver([{ address: '8.8.8.8', family: 4 }]);
    let hops = 0;
    const handler = (_req: any, res: any) => {
      hops++;
      if (hops === 1) {
        res.statusCode = 302;
        res.setHeader('Location', '//169.254.169.254/x');
        res.end();
      } else {
        res.end('should not reach');
      }
    };
    const stub = await startStub(handler);
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      // First hop resolves to whatever the stub bound (127.0.0.1) — allowed
      // under opt-out. The redirect's protocol-relative URL gets parsed and
      // rejected on the always-forbidden check.
      await expect(safeFetch(stub.url + '/start', {}, { resolver }))
        .rejects.toThrow(/always-forbidden|forbidden/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });
});

describe('safeFetch — DNS resolver injection (rebinding defense)', () => {
  it('rejects a hostname that resolves to 127.0.0.1', async () => {
    const r = withResolver([{ address: '127.0.0.1', family: 4 }]);
    await expect(safeFetch('https://attacker.example/loot', {}, { resolver: r }))
      .rejects.toThrow(/resolves to forbidden 127\.0\.0\.1/);
  });

  it('rejects a hostname that resolves to 10.0.0.1 (RFC1918)', async () => {
    const r = withResolver([{ address: '10.0.0.1', family: 4 }]);
    await expect(safeFetch('https://attacker.example/internal', {}, { resolver: r }))
      .rejects.toThrow(/resolves to forbidden 10\.0\.0\.1/);
  });

  it('rejects a hostname that resolves to 169.254.169.254 (IMDS)', async () => {
    const r = withResolver([{ address: '169.254.169.254', family: 4 }]);
    await expect(safeFetch('https://imds-rebind.example/', {}, { resolver: r }))
      .rejects.toThrow(/always-forbidden 169\.254\.169\.254/);
  });

  it('mixed public+private response rejects on the private hop', async () => {
    const r = withResolver([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(safeFetch('https://rebinder.example/', {}, { resolver: r }))
      .rejects.toThrow(/resolves to forbidden 10\.0\.0\.5/);
  });

  it('mixed public + IMDS rejects on the always-forbidden record', async () => {
    const r = withResolver([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    await expect(safeFetch('https://rebind-imds.example/', {}, { resolver: r }))
      .rejects.toThrow(/always-forbidden 169\.254\.169\.254/);
  });

  it('IPv6 link-local rejects', async () => {
    const r = withResolver([{ address: 'fe80::1', family: 6 }]);
    await expect(safeFetch('https://v6-rebind.example/', {}, { resolver: r }))
      .rejects.toThrow(/always-forbidden fe80::1/);
  });

  it('empty DNS response (NODATA) is rejected', async () => {
    const r = withResolver([]);
    await expect(safeFetch('https://nodata.example/', {}, { resolver: r }))
      .rejects.toThrow(/dns returned no addresses/);
  });

  it('DNS-failed propagates as SsrfBlockedError (not silent null)', async () => {
    const r: ResolverFn = async () => { throw new Error('ENOTFOUND'); };
    await expect(safeFetch('https://broken.example/', {}, { resolver: r }))
      .rejects.toThrow(/dns lookup failed/);
  });

  it('DNS timeout via injected slow resolver', async () => {
    const slow: ResolverFn = () => new Promise(() => {}); // never resolves
    await expect(safeFetch('https://slow.example/', {}, { resolver: slow, dnsTimeoutMs: 50 }))
      .rejects.toThrow(/timed out after 50ms/);
  });

  it('opt-out narrowing: hostname (not literal-local) resolving to private STILL rejects under env=1', async () => {
    // The previous wider opt-out bypassed all checks for non-IP hosts;
    // the narrowed version still rejects so an `internal-jira.corp`
    // hostname doesn't slip past when the operator turned on env for
    // "localhost stub" testing.
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    const r = withResolver([{ address: '10.0.0.5', family: 4 }]);
    try {
      await expect(safeFetch('http://internal-jira.corp/', {}, { resolver: r }))
        .rejects.toThrow(/forbidden 10\.0\.0\.5/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
    }
  });

  it('opt-out narrowing: literal-local hostname (localhost) IS allowed under env=1', async () => {
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    const r = withResolver([{ address: '127.0.0.1', family: 4 }]);
    // We won't actually fetch — instead use assertPublicUrl-style check by
    // forcing the validation through a non-fetching helper. assertPublicUrl
    // is strict so use safeFetch with a stub instead.
    const stub = await startStub((_req, res) => { res.end('ok'); });
    try {
      // Stub binds 127.0.0.1; the URL still uses hostname=localhost.
      const port = new URL(stub.url).port;
      const res = await safeFetch(`http://localhost:${port}/x`, {}, { resolver: r });
      expect(res.status).toBe(200);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });
});

describe('assertPublicUrl — strict-mode pre-check', () => {
  it('ignores TANDOOR_MCP_ALLOW_PRIVATE_FETCH (Tandoor-delegated surface)', async () => {
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(assertPublicUrl('http://127.0.0.1/x')).rejects.toThrow(/forbidden/);
      await expect(assertPublicUrl('http://169.254.169.254/')).rejects.toThrow(/always-forbidden/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
    }
  });

  it('accepts a public URL', async () => {
    const r = withResolver([{ address: '8.8.8.8', family: 4 }]);
    const parsed = await assertPublicUrl('https://public.example/recipe', { resolver: r });
    expect(parsed.hostname).toBe('public.example');
  });

  it('rejects file:// without DNS', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/unsupported scheme/);
  });
});

describe('safeFetchBytes — content-length cap', () => {
  it('rejects when Content-Length exceeds maxBytes (before reading)', async () => {
    const stub = await startStub((_req, res) => {
      res.setHeader('content-length', '999999');
      res.statusCode = 200;
      res.end('but only writes a little');
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetchBytes(stub.url + '/big', {}, { maxBytes: 100 }))
        .rejects.toThrow(/content-length 999999 exceeds maxBytes 100/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('rejects when streamed body exceeds maxBytes despite missing Content-Length', async () => {
    const stub = await startStub((_req, res) => {
      res.statusCode = 200;
      // No content-length header — chunked. Write more than maxBytes.
      res.write('A'.repeat(200));
      res.end('B'.repeat(200));
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      await expect(safeFetchBytes(stub.url + '/stream', {}, { maxBytes: 100 }))
        .rejects.toThrow(/exceeded maxBytes/);
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });

  it('returns bytes when within cap', async () => {
    const stub = await startStub((_req, res) => {
      res.statusCode = 200;
      res.end('hello');
    });
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      const { res, bytes } = await safeFetchBytes(stub.url + '/x', {}, { maxBytes: 100 });
      expect(res.ok).toBe(true);
      expect(new TextDecoder().decode(bytes)).toBe('hello');
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      await stub.close();
    }
  });
});
