import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport, resolveHttpConfig, bearerMatches, FailedAuthLimiter } from '../src/lib/http-transport.js';
import type { Server } from 'node:http';

function captureStderr(): { lines: string[]; restore: () => void; joined(): string } {
  const original = process.stderr.write;
  const lines: string[] = [];
  const spy = vi.fn((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  });
  process.stderr.write = spy as unknown as typeof process.stderr.write;
  return {
    lines,
    restore: () => { process.stderr.write = original; },
    joined: () => lines.join(''),
  };
}

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  delete process.env.TANDOOR_MCP_HTTP_PORT;
  delete process.env.TANDOOR_MCP_HTTP_TOKEN;
  delete process.env.TANDOOR_MCP_HTTP_PATH;
  delete process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES;
  delete process.env.TANDOOR_MCP_HTTP_MAX_CONNS;
  delete process.env.TANDOOR_MCP_HTTP_DRAIN_MS;
}

function pickPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

function buildServer(): McpServer {
  return new McpServer({ name: 'test', version: '0.0.0' });
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text };
}

function initializeRpc() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.0.0' },
    },
  };
}

describe('resolveHttpConfig', () => {
  beforeEach(resetEnv);
  afterEach(() => {
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('defaults to port 3737 on 127.0.0.1 with no auth', () => {
    const cfg = resolveHttpConfig();
    expect(cfg.port).toBe(3737);
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.requireAuth).toBe(false);
    expect(cfg.token).toBeUndefined();
  });

  it('honors TANDOOR_MCP_HTTP_PORT and TANDOOR_MCP_HTTP_TOKEN', () => {
    process.env.TANDOOR_MCP_HTTP_PORT = '4242';
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    const cfg = resolveHttpConfig();
    expect(cfg.port).toBe(4242);
    expect(cfg.requireAuth).toBe(true);
    expect(cfg.token).toBe('sekret');
  });

  it('defaults path to /mcp and maxBodyBytes to 5MB', () => {
    const cfg = resolveHttpConfig();
    expect(cfg.path).toBe('/mcp');
    expect(cfg.maxBodyBytes).toBe(5_242_880);
  });

  it('honors TANDOOR_MCP_HTTP_PATH and TANDOOR_MCP_HTTP_MAX_BODY_BYTES', () => {
    process.env.TANDOOR_MCP_HTTP_PATH = '/custom';
    process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES = '1024';
    const cfg = resolveHttpConfig();
    expect(cfg.path).toBe('/custom');
    expect(cfg.maxBodyBytes).toBe(1024);
  });
});

describe('createHttpTransport round-trip', () => {
  let handle: { start(): Promise<void>; stop(): Promise<void> } | undefined;

  beforeEach(resetEnv);
  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = undefined;
    }
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('handles a POST initialize round-trip', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.status).toBe(200);
    // SSE or JSON both acceptable; both carry the JSON-RPC id
    expect(res.body).toContain('"jsonrpc"');
    expect(res.body).toContain('"result"');
  });

  it('returns 401 with WWW-Authenticate when token is set and missing', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('returns 401 when bearer token is wrong', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), {
      Authorization: 'Bearer wrong',
    });
    expect(res.status).toBe(401);
  });

  it('accepts the correct bearer token', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), {
      Authorization: 'Bearer sekret',
    });
    expect(res.status).toBe(200);
  });

  it('routes JSON-RPC to configured TANDOOR_MCP_HTTP_PATH', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_PATH = '/custom';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const okRes = await postJson(`http://127.0.0.1:${port}/custom`, initializeRpc());
    expect(okRes.status).toBe(200);
    expect(okRes.body).toContain('"jsonrpc"');

    const missRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initializeRpc()),
    });
    expect(missRes.status).toBe(404);
  });

  it('rejects request bodies larger than maxBodyBytes with 413', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES = '128';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const oversized = { jsonrpc: '2.0', id: 1, method: 'x', params: { pad: 'A'.repeat(4096) } };
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, oversized);
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'payload too large', data: { max_bytes: 128 } },
    });
  });

  it('binds loopback only, not 0.0.0.0', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    // Attempt to reach the port via a non-loopback route; connecting to
    // 127.0.0.2 (or any other loopback alias not equal to 127.0.0.1) will
    // refuse when the socket is bound to 127.0.0.1 specifically.
    const loopbackRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initializeRpc()),
    });
    expect(loopbackRes.status).toBe(200);

    // Ask the underlying server for its bound address via a diagnostic getter.
    expect(handle).toBeDefined();
    const address = (handle as unknown as { address(): { address: string; port: number } | null }).address();
    expect(address?.address).toBe('127.0.0.1');
    expect(address?.port).toBe(port);
  });

  it('logs event=auth_missing on stderr when token required and header absent', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const cap = captureStderr();
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    cap.restore();
    expect(res.status).toBe(401);
    expect(cap.joined()).toContain('event=auth_missing');
  });

  it('logs event=auth_wrong on stderr when bearer wrong', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const cap = captureStderr();
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { Authorization: 'Bearer wrong-shh' });
    cap.restore();
    expect(res.status).toBe(401);
    expect(cap.joined()).toContain('event=auth_wrong');
  });

  it('logs event=not_found on stderr for unknown routes', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/nope`, { method: 'GET' });
    cap.restore();
    expect(res.status).toBe(404);
    expect(cap.joined()).toContain('event=not_found');
  });

  it('sets an x-tandoor-req-id header on every response', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.headers.get('x-tandoor-req-id')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('reqId in response header matches reqId in stderr log line', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/nope`, { method: 'GET' });
    cap.restore();
    const reqId = res.headers.get('x-tandoor-req-id');
    expect(reqId).toBeTruthy();
    expect(cap.joined()).toContain(`reqId=${reqId}`);
  });

  it('GET /healthz returns 200 status ok without auth even when token required', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'GET' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('sets maxConnections, headersTimeout, requestTimeout on the underlying server', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_MAX_CONNS = '64';
    handle = createHttpTransport(buildServer());
    await handle.start();

    const srv = (handle as unknown as { server(): Server }).server();
    expect(srv.maxConnections).toBe(64);
    expect(srv.headersTimeout).toBe(10_000);
    expect(srv.requestTimeout).toBe(30_000);
  });

  // Windows sometimes returns EACCES on rapid port binds; rate-limit logic is exercised on POSIX runners.
  it.skipIf(process.platform === 'win32')('rate-limits repeated failed bearer auths from same address with 429 + Retry-After', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer());
    await handle.start();

    for (let i = 0; i < 20; i++) {
      const r = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { Authorization: 'Bearer wrong' });
      expect(r.status).toBe(401);
    }
    const tripped = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { Authorization: 'Bearer wrong' });
    expect(tripped.status).toBe(429);
    expect(tripped.headers.get('retry-after')).toBe('5');
    expect(JSON.parse(tripped.body)).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Too many auth failures' },
    });
  });

  it('malformed JSON body is caught by outer wrap → 500 JSON-RPC envelope + stderr internal_error', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: '{not json',
    });
    const body = await res.text();
    cap.restore();
    expect(res.status).toBe(500);
    const parsed = JSON.parse(body);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.error.code).toBe(-32603);
    expect(cap.joined()).toContain('event=internal_error');
  });

  it('serves parallel requests without transport-layer crashes and stamps distinct reqIds', async () => {
    // Note: MCP StreamableHTTPServerTransport (stateless mode) serializes RPCs
    // at the SDK layer, so a truly concurrent second RPC can return 500 from
    // the SDK itself. Our http transport must still respond to both and stamp
    // distinct x-tandoor-req-id headers on each.
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    handle = createHttpTransport(buildServer());
    await handle.start();

    const [rA, rB] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/healthz`, { method: 'GET' }),
      fetch(`http://127.0.0.1:${port}/healthz`, { method: 'GET' }),
    ]);
    expect(rA.status).toBe(200);
    expect(rB.status).toBe(200);
    const idA = rA.headers.get('x-tandoor-req-id');
    const idB = rB.headers.get('x-tandoor-req-id');
    expect(idA).toMatch(/^[0-9a-f]{8}$/);
    expect(idB).toMatch(/^[0-9a-f]{8}$/);
    expect(idA).not.toBe(idB);
  });

  it('stop() enters draining mode: subsequent requests return 503 shutdown envelope', async () => {
    const port = pickPort();
    process.env.TANDOOR_MCP_HTTP_PORT = String(port);
    const h = createHttpTransport(buildServer());
    await h.start();
    // Kick off stop; do not await yet so the socket is still up briefly.
    const stopping = h.stop();
    // Immediately try a request; server may accept or reject the connection.
    let seen503 = false;
    try {
      const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
      if (res.status === 503) {
        seen503 = true;
        const parsed = JSON.parse(res.body);
        expect(parsed.error.message).toBe('Shutting down');
      }
    } catch {
      // Connection refused after close is acceptable — still counts as "not serving".
      seen503 = true;
    }
    await stopping;
    handle = undefined;
    expect(seen503).toBe(true);
  });
});

describe('bearerMatches', () => {
  it('returns false when header absent', () => {
    expect(bearerMatches(undefined, 'abc')).toBe(false);
  });

  it('returns false when wrong length (short-circuit, no timingSafeEqual crash)', () => {
    expect(bearerMatches('Bearer x', 'abcdefghij')).toBe(false);
  });

  it('returns true for exact match', () => {
    expect(bearerMatches('Bearer sekret', 'sekret')).toBe(true);
  });

  it('returns false for equal-length wrong bytes', () => {
    expect(bearerMatches('Bearer abcdef', 'ghijkl')).toBe(false);
  });

  it('returns false when scheme is missing', () => {
    expect(bearerMatches('sekret', 'sekret')).toBe(false);
  });
});

describe('FailedAuthLimiter', () => {
  it('trips after 20 back-to-back failures from the same key', () => {
    const limiter = new FailedAuthLimiter();
    for (let i = 0; i < 20; i++) expect(limiter.consume('127.0.0.1')).toBe(true);
    expect(limiter.consume('127.0.0.1')).toBe(false);
  });
});
