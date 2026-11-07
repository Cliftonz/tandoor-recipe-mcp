import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { connect } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport, type HttpTransportHandle } from '../src/lib/http-transport.js';

const VARS = ['TANDOOR_MCP_PUBLIC_URL', 'TANDOOR_MCP_SECRET_KEY', 'TANDOOR_MCP_DATA_DIR', 'TANDOOR_MCP_HTTP_PORT'];
const FORBIDDEN = { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Forbidden' } };
const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '0.0.0' } },
});

let root: string;
let handle: HttpTransportHandle;
let port: number;

const server = () => new McpServer({ name: 'test', version: '0.0.0' });

function send(method: string, path: string, headers: Record<string, string>, body = ''): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function sendRaw(raw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.end(raw));
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => { text += chunk; });
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
}

const postMcp = (headers: Record<string, string>) =>
  send('POST', '/mcp', { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, INITIALIZE);

async function start(serve: Parameters<typeof createHttpTransport>[0], tandoorUrl?: string): Promise<void> {
  handle = createHttpTransport(serve, tandoorUrl);
  await handle.start();
  port = handle.address()!.port;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dns-rebinding-'));
  process.env.TANDOOR_MCP_DATA_DIR = root;
  process.env.TANDOOR_MCP_HTTP_PORT = '0';
});

afterEach(async () => {
  vi.restoreAllMocks();
  await handle?.stop();
  for (const name of VARS) delete process.env[name];
  rmSync(root, { recursive: true, force: true });
});

describe('remote mode', () => {
  beforeEach(async () => {
    process.env.TANDOOR_MCP_PUBLIC_URL = 'https://mcp.example.com/mcp';
    process.env.TANDOOR_MCP_SECRET_KEY = 'ab'.repeat(32);
    await start({ remote: server }, 'https://recipes.example.com');
  });

  it('accepts the public host', async () => {
    expect((await send('GET', '/healthz', { Host: 'mcp.example.com' })).status).toBe(200);
  });

  it('accepts a loopback host on any port', async () => {
    expect((await send('GET', '/healthz', { Host: `127.0.0.1:${port}` })).status).toBe(200);
  });

  it('accepts an IPv6 loopback host', async () => {
    expect((await send('GET', '/healthz', { Host: `[::1]:${port}` })).status).toBe(200);
  });

  it('refuses a request without a host header with 403', async () => {
    expect(await sendRaw('GET /healthz HTTP/1.0\r\n\r\n')).toMatch(/^HTTP\/1\.1 403 /);
  });

  it('refuses a null origin on the MCP path with 403', async () => {
    expect((await postMcp({ Origin: 'null' })).status).toBe(403);
  });

  it.each(['/mcp', '/healthz', '/.well-known/oauth-authorization-server'])('refuses a foreign host on %s with 403', async (path) => {
    const res = await send(path === '/mcp' ? 'POST' : 'GET', path, { Host: 'evil.example' });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual(FORBIDDEN);
  });

  it('lets the public origin reach bearer auth on the MCP path', async () => {
    expect((await postMcp({ Origin: 'https://mcp.example.com' })).status).toBe(401);
  });

  it('refuses a foreign origin on the MCP path with 403', async () => {
    const res = await postMcp({ Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual(FORBIDDEN);
  });

  it('logs one truncated line per refusal', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await send('GET', '/healthz', { Host: `${'x'.repeat(200)}.example` });
    const lines = stderr.mock.calls.map(([chunk]) => String(chunk)).filter((line) => line.includes('event=host_rejected'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`host=${'x'.repeat(64)}`);
    expect(lines[0]).not.toContain('x'.repeat(65));
    expect(lines[0]).toContain('hint=if behind nginx, set proxy_set_header Host $host');
  });

  it('lets a request without an origin reach bearer auth on the MCP path', async () => {
    expect((await postMcp({})).status).toBe(401);
  });

  it('leaves the origin on the token route to the SDK', async () => {
    const res = await send('POST', '/token', { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, 'grant_type=authorization_code');
    expect(res.status).toBe(400);
  });
});

describe('remote mode on a non-default port', () => {
  beforeEach(async () => {
    process.env.TANDOOR_MCP_PUBLIC_URL = 'https://mcp.example.com:8443/mcp';
    process.env.TANDOOR_MCP_SECRET_KEY = 'ab'.repeat(32);
    await start({ remote: server }, 'https://recipes.example.com');
  });

  it('refuses the public host without its port with 403', async () => {
    expect((await send('GET', '/healthz', { Host: 'mcp.example.com' })).status).toBe(403);
  });
});

describe('local HTTP mode', () => {
  beforeEach(async () => {
    await start(server);
  });

  it('accepts any host', async () => {
    expect((await send('GET', '/healthz', { Host: 'evil.example' })).status).toBe(200);
  });

  it('accepts a loopback origin on the MCP path', async () => {
    expect((await postMcp({ Origin: 'http://localhost:3000' })).status).toBe(200);
  });

  it('refuses a foreign origin on the MCP path with 403', async () => {
    const res = await postMcp({ Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual(FORBIDDEN);
  });

  it('accepts a request without an origin on the MCP path', async () => {
    expect((await postMcp({})).status).toBe(200);
  });

  it('accepts an IPv6 loopback origin on the MCP path', async () => {
    expect((await postMcp({ Origin: 'http://[::1]:3000' })).status).toBe(200);
  });

  it('refuses a null origin on the MCP path with 403', async () => {
    expect((await postMcp({ Origin: 'null' })).status).toBe(403);
  });
});
