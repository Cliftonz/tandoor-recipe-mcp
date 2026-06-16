// Closes the test gaps surfaced after the R3 review: counter integration,
// handler-boundary image_url SSRF, test-skip env scoping, symlink-swap
// TOCTOU, cross-origin credential drop, and guard log format.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  writeFileSync, mkdtempSync, rmSync, symlinkSync, unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import {
  registerStringTool,
  getGuardRejectionStats,
  _resetGuardRejectionStats,
  _resetRegisteredNames,
} from '../src/lib/register.js';
import { invokeTool } from './helpers/mcp.js';
import { handleGuardStats } from '../src/handlers/jq.js';
import { handleUploadRecipeImage } from '../src/handlers/recipe.js';
import { handleImportRecipeFromUrl } from '../src/handlers/recipe.js';
import {
  assertSafeUploadPath,
  openSafeUpload,
  _resetPathGuardCache,
} from '../src/lib/path-guard.js';
import { safeFetch } from '../src/lib/safe-fetch.js';
import { startStub } from './helpers/stub-http.js';
import { mockClient } from './helpers/mock-client.js';

const mock = (impl: Parameters<typeof mockClient<TandoorClient>>[0]) => mockClient<TandoorClient>(impl);

// ============================================================
// T1 — guard counters + get_guard_stats
// ============================================================
describe('guard rejection counters', () => {
  const client = new TandoorClient({ url: 'https://x.test', token: 't' });
  function freshServer(): McpServer {
    return new McpServer({ name: 't', version: 't' });
  }

  beforeEach(() => {
    _resetRegisteredNames();
    _resetGuardRejectionStats();
  });

  it('PathGuardError increments the PathGuardError counter', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'fail_path', {
      description: 'simulates a guard rejection',
      inputSchema: {},
    }, async () => {
      const err = new Error('outside the allowed upload roots');
      err.name = 'PathGuardError';
      throw err;
    });
    await invokeTool(server, 'fail_path', {});
    expect(getGuardRejectionStats().PathGuardError).toBe(1);
    expect(getGuardRejectionStats().SsrfBlockedError).toBe(0);
  });

  it('SsrfBlockedError increments the SsrfBlockedError counter', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'fail_ssrf', {
      description: 'simulates an SSRF rejection',
      inputSchema: {},
    }, async () => {
      const err = new Error('SSRF guard blocked http://127.0.0.1/');
      err.name = 'SsrfBlockedError';
      throw err;
    });
    await invokeTool(server, 'fail_ssrf', {});
    expect(getGuardRejectionStats().SsrfBlockedError).toBe(1);
    expect(getGuardRejectionStats().PathGuardError).toBe(0);
  });

  it('generic Error does NOT increment any guard counter', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'fail_generic', {
      description: 'plain error',
      inputSchema: {},
    }, async () => { throw new Error('regular bug'); });
    await invokeTool(server, 'fail_generic', {});
    const stats = getGuardRejectionStats();
    expect(stats.PathGuardError).toBe(0);
    expect(stats.SsrfBlockedError).toBe(0);
  });

  it('counters accumulate across multiple rejections in the same process', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'fail_again', {
      description: 'fails twice',
      inputSchema: {},
    }, async () => {
      const err = new Error('outside'); err.name = 'PathGuardError'; throw err;
    });
    await invokeTool(server, 'fail_again', {});
    await invokeTool(server, 'fail_again', {});
    await invokeTool(server, 'fail_again', {});
    expect(getGuardRejectionStats().PathGuardError).toBe(3);
  });

  it('handleGuardStats returns the expected shape', async () => {
    _resetGuardRejectionStats();
    const stats = JSON.parse(await handleGuardStats({} as any, {}));
    expect(stats).toEqual({ PathGuardError: 0, SsrfBlockedError: 0 });
  });

  it('_resetGuardRejectionStats clears counters', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'fail_reset', {
      description: 'fails once',
      inputSchema: {},
    }, async () => {
      const err = new Error('x'); err.name = 'PathGuardError'; throw err;
    });
    await invokeTool(server, 'fail_reset', {});
    expect(getGuardRejectionStats().PathGuardError).toBe(1);
    _resetGuardRejectionStats();
    expect(getGuardRejectionStats().PathGuardError).toBe(0);
  });
});

// ============================================================
// T6 — guard log line format
// ============================================================
describe('guard log line format', () => {
  const client = new TandoorClient({ url: 'https://x.test', token: 't' });
  let errSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetRegisteredNames();
    _resetGuardRejectionStats();
    errSpy = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(errSpy);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the documented format: [tandoor-mcp] guard rejection <ErrName> tool=<X> req=<Y> msg=<Z>', async () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerStringTool(server, client, 'pg_fail', {
      description: 'fires path guard',
      inputSchema: {},
    }, async () => {
      const err = new Error('outside the allowed upload roots');
      err.name = 'PathGuardError';
      throw err;
    });
    await invokeTool(server, 'pg_fail', {});
    const guardLines = errSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => /guard rejection/.test(s));
    expect(guardLines.length).toBe(1);
    expect(guardLines[0]).toMatch(
      /^\[tandoor-mcp\] guard rejection (PathGuardError|SsrfBlockedError) tool=\S+ req=\S+ msg=/,
    );
  });

  it('SsrfBlockedError log line names the correct error', async () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerStringTool(server, client, 'ssrf_fail', {
      description: 'fires ssrf guard',
      inputSchema: {},
    }, async () => {
      const err = new Error('SSRF guard blocked http://127.0.0.1/');
      err.name = 'SsrfBlockedError';
      throw err;
    });
    await invokeTool(server, 'ssrf_fail', {});
    const guardLines = errSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => /guard rejection/.test(s));
    expect(guardLines[0]).toMatch(/SsrfBlockedError tool=ssrf_fail/);
  });

  it('generic error does NOT emit a guard rejection line', async () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerStringTool(server, client, 'plain_fail', {
      description: 'plain bug',
      inputSchema: {},
    }, async () => { throw new Error('regular bug'); });
    await invokeTool(server, 'plain_fail', {});
    const guardLines = errSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => /guard rejection/.test(s));
    expect(guardLines.length).toBe(0);
  });
});

// ============================================================
// T2 — image_url SSRF handler-boundary (mirror of url-import)
// ============================================================
describe('upload_recipe_image image_url SSRF rejections', () => {
  beforeEach(() => {
    delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK;
    delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
  });

  it('image_url = http://127.0.0.1/... → SsrfBlockedError; no Tandoor call', async () => {
    const upload = vi.fn();
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await expect(handleUploadRecipeImage(client, {
      id: 1, image_url: 'http://127.0.0.1/x.png',
    } as any)).rejects.toThrow(/SSRF guard blocked/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('image_url = http://169.254.169.254/... → SsrfBlockedError; no Tandoor call', async () => {
    const upload = vi.fn();
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await expect(handleUploadRecipeImage(client, {
      id: 1, image_url: 'http://169.254.169.254/cred.png',
    } as any)).rejects.toThrow(/always-forbidden/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('image_url strict pre-check ignores TANDOOR_MCP_ALLOW_PRIVATE_FETCH', async () => {
    // Even with the dev opt-out on, image_url goes to Tandoor server-side.
    // Tandoor in a cloud VPC could reach IMDS — must stay strict.
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
    try {
      const upload = vi.fn();
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await expect(handleUploadRecipeImage(client, {
        id: 1, image_url: 'http://169.254.169.254/cred.png',
      } as any)).rejects.toThrow(/always-forbidden/);
      expect(upload).not.toHaveBeenCalled();
    } finally {
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
    }
  });

  it('Tandoor-delegated import URL = http://127.0.0.1/... blocked before recipeFromSource', async () => {
    const recipeFromSource = vi.fn();
    const client = mock({
      recipes: {
        recipeFromSource,
        createRecipe: vi.fn(),
      },
      ingredients: { parseIngredientString: vi.fn() },
    });
    await expect(handleImportRecipeFromUrl(client, {
      url: 'http://127.0.0.1/recipe',
      create_stub_on_failure: true,
    } as any)).rejects.toThrow(/SSRF guard blocked/);
    expect(recipeFromSource).not.toHaveBeenCalled();
  });
});

// ============================================================
// T3 — TEST_SKIP_URL_CHECK escape-hatch scoping
// ============================================================
describe('TANDOOR_MCP_TEST_SKIP_URL_CHECK is scoped to reserved TLDs', () => {
  beforeEach(() => {
    process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1';
  });
  afterEach(() => {
    delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK;
  });

  it('reserved .test TLD bypasses DNS via the escape hatch', async () => {
    // No resolver injected — if the escape hatch didn't fire we'd hit real
    // DNS which would NXDOMAIN. The mock fetch never fires because we have
    // no real stub; we just confirm the pre-DNS rejection path was skipped
    // and the call proceeds far enough to hit fetch failure (not SSRF).
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('mock-fetch-called'));
    try {
      await expect(safeFetch('http://example.test/x')).rejects.toThrow(/mock-fetch-called/);
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('non-reserved TLD (.com) still goes through DNS even with escape hatch set', async () => {
    // attacker.com has no resolver injected — assertSafeUrl performs real DNS.
    // The lookup will resolve (or NXDOMAIN), but either way the SSRF guard
    // controls the path. We assert fetch was NOT called via test-skip (since
    // the escape hatch only fires for reserved TLDs, real DNS gates this).
    // Mock the real DNS to point at IMDS — must reject on always-forbidden.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(safeFetch('http://attacker.com/loot', {}, {
        resolver: async () => [{ address: '169.254.169.254', family: 4 }],
      })).rejects.toThrow(/always-forbidden/);
      // Critical: fetch was never reached.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('attacker-controlled hostname ending in non-reserved TLD is NOT a free pass', async () => {
    // `127.0.0.1.attacker.com` — hostname ends in `.com`, not `.test`.
    // Escape hatch must NOT fire. Resolver returns loopback (which a
    // hostile DNS could legitimately do); strict checks still gate it.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(safeFetch('http://127.0.0.1.attacker.com/loot', {}, {
        resolver: async () => [{ address: '127.0.0.1', family: 4 }],
      })).rejects.toThrow(/forbidden 127\.0\.0\.1/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('.invalid TLD bypasses (reserved per RFC 6761)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('reached fetch'));
    try {
      await expect(safeFetch('http://x.invalid/y')).rejects.toThrow(/reached fetch/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ============================================================
// T4 — openSafeUpload symlink-swap race
// ============================================================
describe('openSafeUpload symlink-swap race', () => {
  let allowed: string;
  let outside: string;
  let prevRoot: string | undefined;

  beforeEach(() => {
    allowed = mkdtempSync(path.join(tmpdir(), 'sym-swap-allowed-'));
    outside = mkdtempSync(path.join(tmpdir(), 'sym-swap-outside-'));
    prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
    process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
    _resetPathGuardCache();
  });
  afterEach(() => {
    rmSync(allowed, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
    else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
    _resetPathGuardCache();
  });

  it.skipIf(process.platform === 'win32')(
    'file swapped for a symlink between validate and open is refused (O_NOFOLLOW)',
    async () => {
      const target = path.join(allowed, 'photo.png');
      writeFileSync(target, 'real');
      const v = await assertSafeUploadPath(target);
      // Swap: regular file → symlink pointing at a secret outside the root.
      const secret = path.join(outside, 'aws-creds');
      writeFileSync(secret, 'aws_secret_access_key=...');
      unlinkSync(target);
      symlinkSync(secret, target);
      // O_NOFOLLOW (POSIX) refuses to follow the symlink at open. On
      // platforms without O_NOFOLLOW the ino/dev check still detects
      // the swap. Either way: throws PathGuardError.
      await expect(openSafeUpload(v)).rejects.toThrow(
        /open refused|identity changed/,
      );
    },
  );
});

// ============================================================
// T5 — cross-origin Authorization header drop
// ============================================================
describe('safeFetch drops Authorization on cross-origin redirect', () => {
  beforeEach(() => {
    process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
  });
  afterEach(() => {
    delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
  });

  it('redirect to a different origin strips Authorization + Cookie headers', async () => {
    // First stub returns a redirect to the second stub (different port → different origin).
    const stub2 = await startStub((req, res) => {
      // Second stub records the headers it received.
      const got = {
        authorization: req.headers['authorization'] ?? null,
        cookie: req.headers['cookie'] ?? null,
        custom: req.headers['x-custom'] ?? null,
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(got));
    });
    const stub1 = await startStub((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', stub2.url + '/landed');
      res.end();
    });
    try {
      const res = await safeFetch(stub1.url + '/start', {
        headers: {
          Authorization: 'Bearer SECRET',
          Cookie: 'session=ABC',
          'X-Custom': 'keep-me', // non-credential — should pass through
        },
      });
      const body = await res.json() as any;
      // Authorization + Cookie dropped on cross-origin hop.
      expect(body.authorization).toBeNull();
      expect(body.cookie).toBeNull();
      // Non-sensitive headers preserved.
      expect(body.custom).toBe('keep-me');
    } finally {
      await stub1.close();
      await stub2.close();
    }
  });

  it('same-origin redirect preserves Authorization', async () => {
    let hops = 0;
    const stub = await startStub((req, res) => {
      hops++;
      if (hops === 1) {
        res.statusCode = 302;
        res.setHeader('location', '/landed'); // relative → same origin
        res.end();
        return;
      }
      const auth = req.headers['authorization'] ?? null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ auth }));
    });
    try {
      const res = await safeFetch(stub.url + '/start', {
        headers: { Authorization: 'Bearer KEEP' },
      });
      const body = await res.json() as any;
      expect(body.auth).toBe('Bearer KEEP');
    } finally {
      await stub.close();
    }
  });

  it('header forms (object, Headers, array) all strip on cross-origin', async () => {
    const stub2 = await startStub((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ auth: req.headers['authorization'] ?? null }));
    });
    const stub1 = await startStub((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', stub2.url + '/x');
      res.end();
    });
    try {
      // Object form
      const r1 = await safeFetch(stub1.url + '/a', {
        headers: { Authorization: 'Bearer X' },
      });
      expect((await r1.json() as any).auth).toBeNull();

      // Headers instance
      const h = new Headers();
      h.set('Authorization', 'Bearer Y');
      const r2 = await safeFetch(stub1.url + '/b', { headers: h });
      expect((await r2.json() as any).auth).toBeNull();

      // Array form
      const r3 = await safeFetch(stub1.url + '/c', {
        headers: [['Authorization', 'Bearer Z']],
      });
      expect((await r3.json() as any).auth).toBeNull();
    } finally {
      await stub1.close();
      await stub2.close();
    }
  });
});
