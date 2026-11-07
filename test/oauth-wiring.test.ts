import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport, resolveHttpConfig, type HttpTransportHandle } from '../src/lib/http-transport.js';

const VARS = ['TANDOOR_MCP_PUBLIC_URL', 'TANDOOR_MCP_SECRET_KEY', 'TANDOOR_MCP_DATA_DIR', 'TANDOOR_MCP_HTTP_PORT', 'TANDOOR_MCP_HTTP_PATH', 'TANDOOR_MCP_TRUST_PROXY'];

let root: string;
let handle: HttpTransportHandle | undefined;

const remoteEnv = (path = '/mcp') => {
  process.env.TANDOOR_MCP_PUBLIC_URL = `https://mcp.example.com${path}`;
  process.env.TANDOOR_MCP_SECRET_KEY = 'ab'.repeat(32);
  if (path !== '/mcp') process.env.TANDOOR_MCP_HTTP_PATH = path;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'oauth-wiring-'));
  process.env.TANDOOR_MCP_DATA_DIR = root;
  process.env.TANDOOR_MCP_HTTP_PORT = '0';
  handle = undefined;
});

afterEach(async () => {
  await handle?.stop();
  for (const name of VARS) delete process.env[name];
  rmSync(root, { recursive: true, force: true });
});

async function start(serve: Parameters<typeof createHttpTransport>[0], tandoorUrl?: string): Promise<string> {
  handle = createHttpTransport(serve, tandoorUrl);
  await handle.start();
  return `http://127.0.0.1:${handle.address()!.port}`;
}

const register = (base: string, forwardedFor: string) =>
  fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }),
  });

describe('OAuth wiring', () => {
  it('mounts the authorization server in remote mode and keeps the MCP path challenge', async () => {
    remoteEnv();
    const base = await start('remote', 'https://recipes.example.com');

    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ issuer: 'https://mcp.example.com/' });
    const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get('www-authenticate')).toBe('Bearer realm="tandoor-mcp"');
  });

  it('mounts nothing new outside remote mode', async () => {
    const base = await start(() => new McpServer({ name: 'test', version: '0.0.0' }));
    expect((await fetch(`${base}/.well-known/oauth-authorization-server`)).status).toBe(404);
    expect((await fetch(`${base}/register`, { method: 'POST' })).status).toBe(404);
  });

  it('refuses to create a remote-mode transport without the Tandoor URL', () => {
    remoteEnv();
    expect(() => createHttpTransport('remote')).toThrow('Remote mode needs the Tandoor URL.');
  });

  it('keys the SDK endpoint limits per rightmost X-Forwarded-For entry when TANDOOR_MCP_TRUST_PROXY=1', async () => {
    remoteEnv();
    process.env.TANDOOR_MCP_TRUST_PROXY = '1';
    const base = await start('remote', 'https://recipes.example.com');
    for (let i = 0; i < 20; i++) expect((await register(base, `10.0.0.${i}, 203.0.113.1`)).status).toBe(201);
    expect((await register(base, '10.0.0.99, 203.0.113.1')).status).toBe(429);
    expect((await register(base, '10.0.0.1, 203.0.113.2')).status).toBe(201);
  });
});

describe('remote HTTP path', () => {
  it.each(['/authorize', '/token', '/register', '/revoke', '/consent', '/.well-known/mcp', '/Token', '/authorize/mcp'])(
    'refuses TANDOOR_MCP_HTTP_PATH %s because it collides with the OAuth routes',
    (path) => {
      remoteEnv(path);
      expect(() => resolveHttpConfig()).toThrow(`TANDOOR_MCP_HTTP_PATH "${path}" collides with the OAuth routes`);
    },
  );

  it.each(['/mcp', '/tokens', '/api/mcp'])('accepts TANDOOR_MCP_HTTP_PATH %s', (path) => {
    remoteEnv(path);
    expect(resolveHttpConfig().path).toBe(path);
  });
});
