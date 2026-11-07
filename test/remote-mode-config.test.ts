import { describe, it, expect, beforeEach, afterEach, onTestFinished } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveHttpConfig } from '../src/lib/http-transport.js';
import { isRemoteMode } from '../src/lib/register.js';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');
const KEY = 'ab'.repeat(32);
const KEY_HINT = 'openssl rand -hex 32';
const REMOTE_VARS = ['TANDOOR_MCP_PUBLIC_URL', 'TANDOOR_MCP_SECRET_KEY', 'TANDOOR_MCP_HTTP_TOKEN', 'TANDOOR_MCP_HTTP_PATH'];
const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const name of REMOTE_VARS) delete process.env[name];
}

function remoteEnv(overrides: Record<string, string> = {}) {
  Object.assign(process.env, { TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp', TANDOOR_MCP_SECRET_KEY: KEY, ...overrides });
}

describe('isRemoteMode', () => {
  beforeEach(resetEnv);
  afterEach(() => {
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('is off when TANDOOR_MCP_PUBLIC_URL is unset', () => {
    expect(isRemoteMode()).toBe(false);
  });

  it('is off when TANDOOR_MCP_PUBLIC_URL is only whitespace', () => {
    process.env.TANDOOR_MCP_PUBLIC_URL = '   ';
    expect(isRemoteMode()).toBe(false);
  });

  it('is on when TANDOOR_MCP_PUBLIC_URL has a value', () => {
    process.env.TANDOOR_MCP_PUBLIC_URL = 'https://mcp.example.com/mcp';
    expect(isRemoteMode()).toBe(true);
  });
});

describe('resolveHttpConfig in remote mode', () => {
  beforeEach(resetEnv);
  afterEach(() => {
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('has no remote settings outside remote mode', () => {
    expect(resolveHttpConfig().remote).toBeUndefined();
  });

  it('exposes the public URL and the 32-byte secret key', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: '  https://mcp.example.com/mcp  ' });
    const remote = resolveHttpConfig().remote!;
    expect(remote.publicUrl.href).toBe('https://mcp.example.com/mcp');
    expect(remote.secretKey).toEqual(Buffer.from(KEY, 'hex'));
  });

  it('trims the secret key before checking it', () => {
    remoteEnv({ TANDOOR_MCP_SECRET_KEY: `  ${KEY}\n` });
    expect(resolveHttpConfig().remote!.secretKey).toEqual(Buffer.from(KEY, 'hex'));
  });

  it('accepts an uppercase hex secret key', () => {
    remoteEnv({ TANDOOR_MCP_SECRET_KEY: KEY.toUpperCase() });
    expect(resolveHttpConfig().remote!.secretKey).toEqual(Buffer.from(KEY, 'hex'));
  });

  it('treats a whitespace-only secret key as missing', () => {
    remoteEnv({ TANDOOR_MCP_SECRET_KEY: '   ' });
    expect(() => resolveHttpConfig()).toThrow(`TANDOOR_MCP_SECRET_KEY is required when TANDOOR_MCP_PUBLIC_URL is set. Generate one with: ${KEY_HINT}`);
  });

  it.each(['https://mcp.example.com:8443/mcp', 'https://192.168.1.10/mcp', 'https://[::1]:8443/mcp', 'https://localhost/mcp'])(
    'accepts %s',
    (url) => {
      remoteEnv({ TANDOOR_MCP_PUBLIC_URL: url });
      expect(resolveHttpConfig().remote!.publicUrl.href).toBe(url);
    },
  );

  it('rejects a public URL with a query string', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp?x=1' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL must not contain a query string.');
  });

  it('rejects a public URL with an empty query string', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp?' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL must not contain a query string.');
  });

  it('rejects a public URL with a fragment', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp#top' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL must not contain a fragment.');
  });

  it('rejects a public URL with credentials without echoing them', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://user:hunter2@mcp.example.com/mcp' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL must not contain a username or password.');
    expect(() => resolveHttpConfig()).not.toThrow(/hunter2/);
  });

  it('rejects a public URL that does not parse', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://user:hunter2@[bad/mcp' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL is not a valid URL.');
    expect(() => resolveHttpConfig()).not.toThrow(/hunter2/);
  });

  it('rejects a public URL without https', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'http://mcp.example.com/mcp' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL must use https (got http:).');
  });

  it('rejects a public URL whose path differs from the default HTTP path', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/other' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL path "/other" must equal TANDOOR_MCP_HTTP_PATH ("/mcp").');
  });

  it('accepts a public URL whose path matches a custom HTTP path', () => {
    remoteEnv({ TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/custom', TANDOOR_MCP_HTTP_PATH: '/custom' });
    expect(resolveHttpConfig().remote!.publicUrl.pathname).toBe('/custom');
  });

  it('rejects a public URL whose path differs from a custom HTTP path', () => {
    remoteEnv({ TANDOOR_MCP_HTTP_PATH: '/custom' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_PUBLIC_URL path "/mcp" must equal TANDOOR_MCP_HTTP_PATH ("/custom").');
  });

  it('requires TANDOOR_MCP_SECRET_KEY and shows how to generate one', () => {
    remoteEnv({ TANDOOR_MCP_SECRET_KEY: '' });
    expect(() => resolveHttpConfig()).toThrow(`TANDOOR_MCP_SECRET_KEY is required when TANDOOR_MCP_PUBLIC_URL is set. Generate one with: ${KEY_HINT}`);
  });

  it.each([['too short', 'ab'.repeat(31)], ['too long', 'ab'.repeat(33)], ['not hex', 'zz'.repeat(32)]])(
    'rejects a secret key that is %s and shows how to generate one',
    (_label, key) => {
      remoteEnv({ TANDOOR_MCP_SECRET_KEY: key });
      expect(() => resolveHttpConfig()).toThrow(
        `TANDOOR_MCP_SECRET_KEY must be exactly 64 hex characters (32 bytes). Generate one with: ${KEY_HINT}`,
      );
    },
  );

  it('rejects TANDOOR_MCP_HTTP_TOKEN together with remote mode', () => {
    remoteEnv({ TANDOOR_MCP_HTTP_TOKEN: 'sekret' });
    expect(() => resolveHttpConfig()).toThrow('TANDOOR_MCP_HTTP_TOKEN cannot be used with TANDOOR_MCP_PUBLIC_URL.');
  });

  it('treats a whitespace-only TANDOOR_MCP_HTTP_TOKEN as unset in remote mode', () => {
    remoteEnv({ TANDOOR_MCP_HTTP_TOKEN: '   ' });
    expect(resolveHttpConfig().remote).toBeDefined();
  });
});

interface BootResult {
  stderr: string;
  exitCode: number | null;
}

function boot(env: Record<string, string>): Promise<BootResult> {
  return new Promise((settle) => {
    const child = spawn('node', [BUILT_INDEX], {
      cwd: mkdtempSync(join(tmpdir(), 'remote-mode-boot-')),
      env: { PATH: process.env.PATH!, TANDOOR_MAX_RETRIES: '0', TANDOOR_MCP_HTTP_PORT: '0', ...env },
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (/ on (stdio|http)/.test(stderr)) child.kill();
    });
    child.on('exit', (code) => settle({ stderr, exitCode: code }));
  });
}

const TANDOOR_URL_ENV = { TANDOOR_URL: 'http://127.0.0.1:2' };
const REMOTE_ENV = { TANDOOR_MCP_TRANSPORT: 'http', TANDOOR_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp', TANDOOR_MCP_SECRET_KEY: KEY };
const TOKEN_IN_REMOTE_ERROR = 'Error: TANDOOR_TOKEN is not used in remote mode; remove it. Each user connects with their own Tandoor token.';

describe('remote mode at boot', () => {
  it('starts over HTTP with a valid remote configuration and no TANDOOR_TOKEN', async () => {
    const result = await boot({ ...TANDOOR_URL_ENV, ...REMOTE_ENV });
    expect(result.stderr).toContain('on http://127.0.0.1:0/mcp');
    expect(result.stderr).toContain('| auth=oauth |');
    expect(result.stderr).toContain('| public=https://mcp.example.com/mcp |');
  }, 15_000);

  it('starts when TANDOOR_TOKEN is only whitespace', async () => {
    const result = await boot({ ...TANDOOR_URL_ENV, ...REMOTE_ENV, TANDOOR_TOKEN: '   ' });
    expect(result.stderr).toContain('on http://127.0.0.1:0/mcp');
  }, 15_000);

  it.each(['TANDOOR_TOKEN', 'CLAUDE_PLUGIN_OPTION_TANDOOR_TOKEN'])('exits 1 when %s is set', async (name) => {
    const result = await boot({ ...TANDOOR_URL_ENV, ...REMOTE_ENV, [name]: 'tok' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(TOKEN_IN_REMOTE_ERROR);
  }, 15_000);

  it('exits 1 with the validation error for an invalid remote setting', async () => {
    const result = await boot({ ...TANDOOR_URL_ENV, ...REMOTE_ENV, TANDOOR_MCP_PUBLIC_URL: 'http://mcp.example.com/mcp' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: TANDOOR_MCP_PUBLIC_URL must use https (got http:).');
  }, 15_000);

  it('exits 1 when TANDOOR_MCP_PUBLIC_URL is set without the HTTP transport', async () => {
    const result = await boot({ ...TANDOOR_URL_ENV, TANDOOR_MCP_PUBLIC_URL: REMOTE_ENV.TANDOOR_MCP_PUBLIC_URL, TANDOOR_MCP_SECRET_KEY: KEY });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: TANDOOR_MCP_PUBLIC_URL requires TANDOOR_MCP_TRANSPORT=http.');
  }, 15_000);

  it('reports the missing HTTP transport before the TANDOOR_TOKEN error', async () => {
    const result = await boot({ ...TANDOOR_URL_ENV, TANDOOR_TOKEN: 'tok', TANDOOR_MCP_PUBLIC_URL: REMOTE_ENV.TANDOOR_MCP_PUBLIC_URL, TANDOOR_MCP_SECRET_KEY: KEY });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: TANDOOR_MCP_PUBLIC_URL requires TANDOOR_MCP_TRANSPORT=http.');
    expect(result.stderr).not.toContain('TANDOOR_TOKEN is not used');
  }, 15_000);

  it('still requires TANDOOR_URL in remote mode and does not ask for the token', async () => {
    const result = await boot(REMOTE_ENV);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: TANDOOR_URL must be set in .env file (or set the plugin's Tandoor URL setting)");
    expect(result.stderr).not.toContain('TANDOOR_TOKEN');
  }, 15_000);

  it('probes the Tandoor version without an Authorization header', async () => {
    const probes: (string | undefined)[] = [];
    const stub = createServer((req, res) => {
      if (req.url === '/api/server-settings/current/') probes.push(req.headers.authorization);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '2.6.0' }));
    });
    await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
    onTestFinished(() => new Promise<void>((done) => stub.close(() => done())));
    const { port } = stub.address() as AddressInfo;

    const result = await boot({ ...REMOTE_ENV, TANDOOR_URL: `http://127.0.0.1:${port}` });
    expect(result.stderr).toContain('tandoor=2.6.0');
    expect(probes).toEqual([undefined]);
  }, 15_000);
});
