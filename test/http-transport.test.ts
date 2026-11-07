import { describe, it, expect, beforeEach, afterEach, vi, onTestFinished } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport, resolveHttpConfig, bearerMatches, FailedAuthLimiter, jsonRpcErrorHandler, type HttpTransportHandle } from '../src/lib/http-transport.js';
import { request as httpRequest, type Server } from 'node:http';
import type { Request, Response } from 'express';
import { createServer as createNetServer, type AddressInfo } from 'node:net';

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
  delete process.env.TANDOOR_MCP_HTTP_HOST;
  delete process.env.TANDOOR_MCP_TRUST_PROXY;
}

function buildServer(): McpServer {
  return new McpServer({ name: 'test', version: '0.0.0' });
}

function buildServerWithTool(): McpServer {
  const server = buildServer();
  server.registerTool('ping', { description: 'ping' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return server;
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

  it('treats a whitespace-only TANDOOR_MCP_HTTP_TOKEN as unset', () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = '   ';
    const cfg = resolveHttpConfig();
    expect(cfg.requireAuth).toBe(false);
    expect(cfg.token).toBeUndefined();
  });

  it('defaults path to /mcp and maxBodyBytes to 5MB', () => {
    const cfg = resolveHttpConfig();
    expect(cfg.path).toBe('/mcp');
    expect(cfg.maxBodyBytes).toBe(5_242_880);
  });

  it('honors a trimmed TANDOOR_MCP_HTTP_HOST', () => {
    process.env.TANDOOR_MCP_HTTP_HOST = ' 0.0.0.0 ';
    expect(resolveHttpConfig().host).toBe('0.0.0.0');
  });

  it('treats a whitespace-only TANDOOR_MCP_HTTP_HOST as unset', () => {
    process.env.TANDOOR_MCP_HTTP_HOST = '   ';
    expect(resolveHttpConfig().host).toBe('127.0.0.1');
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
  let handle: HttpTransportHandle | undefined;

  beforeEach(() => {
    resetEnv();
    process.env.TANDOOR_MCP_HTTP_PORT = '0';
  });
  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = undefined;
    }
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('rejects start() with EADDRINUSE when the port is already in use', async () => {
    const holder = createNetServer();
    await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
    onTestFinished(() => new Promise<void>((resolve) => holder.close(() => resolve())));
    process.env.TANDOOR_MCP_HTTP_PORT = String((holder.address() as AddressInfo).port);

    await expect(createHttpTransport(buildServer).start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
  }, 2_000);

  it('handles a POST initialize round-trip', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.status).toBe(200);
    // SSE or JSON both acceptable; both carry the JSON-RPC id
    expect(res.body).toContain('"jsonrpc"');
    expect(res.body).toContain('"result"');
  });

  it('streams local POST responses as SSE', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.headers.get('content-type')).toBe('text/event-stream');
  });

  it('answers every sequential POST, not only the first', async () => {
    handle = createHttpTransport(buildServerWithTool);
    await handle.start();
    const port = handle.address()!.port;

    const first = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    const second = await postJson(`http://127.0.0.1:${port}/mcp`, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toContain('"name":"ping"');
  });

  it('closes the per-request server once its response ends', async () => {
    let closed = 0;
    handle = createHttpTransport(() => {
      const server = buildServer();
      server.server.onclose = () => { closed++; };
      return server;
    });
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(closed).toBe(1));
  });

  it('stop() ends an in-flight tool call at the drain deadline', async () => {
    process.env.TANDOOR_MCP_HTTP_DRAIN_MS = '200';
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    onTestFinished(() => release());
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const h = createHttpTransport(() => {
      const server = buildServer();
      server.registerTool('hang', { description: 'hang' }, async () => {
        entered();
        await blocked;
        return { content: [{ type: 'text', text: 'done' }] };
      });
      return server;
    });
    await h.start();
    const port = h.address()!.port;

    const call = postJson(`http://127.0.0.1:${port}/mcp`, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hang', arguments: {} } }).catch(() => undefined);
    await started;
    const outcome = await Promise.race([
      h.stop().then(() => 'stopped'),
      new Promise((resolve) => setTimeout(() => resolve('still draining'), 1000)),
    ]);
    expect(outcome).toBe('stopped');
    await call;
  });

  it.each(['GET', 'DELETE', 'PUT'])('%s on the MCP path returns 405 with Allow: POST and a JSON-RPC error body', async (method) => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } });
  });

  it('logs event=method_not_allowed on stderr for a non-POST on the MCP path', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET' });
    cap.restore();
    expect(res.status).toBe(405);
    expect(cap.joined()).toContain(`reqId=${res.headers.get('x-tandoor-req-id')} level=info event=method_not_allowed method=GET path=/mcp`);
  });

  it('GET on the MCP path without a token returns 401, not 405, when auth is required', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('GET on the MCP path with the correct token returns 405 when auth is required', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET', headers: { Authorization: 'Bearer sekret' } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 401 with WWW-Authenticate when token is set and missing', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('returns 401 when bearer token is wrong', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), {
      Authorization: 'Bearer wrong',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a multibyte bearer guess with the same character length as the token', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { Authorization: 'Bearer sekr\u00e9', 'Content-Type': 'application/json' } },
        (r) => {
          r.resume();
          resolve(r.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(401);
  });

  it('accepts the correct bearer token', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), {
      Authorization: 'Bearer sekret',
    });
    expect(res.status).toBe(200);
  });

  it('routes JSON-RPC to configured TANDOOR_MCP_HTTP_PATH', async () => {
    process.env.TANDOOR_MCP_HTTP_PATH = '/custom';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

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
    process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES = '128';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const oversized = { jsonrpc: '2.0', id: 1, method: 'x', params: { pad: 'A'.repeat(4096) } };
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, oversized);
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'payload too large', data: { max_bytes: 128 } },
    });
  });

  it('binds the address in TANDOOR_MCP_HTTP_HOST', async () => {
    process.env.TANDOOR_MCP_HTTP_HOST = '::1';
    handle = createHttpTransport(buildServer);
    await handle.start();
    expect(handle.address()!.address).toBe('::1');
  });

  it('binds loopback only, not 0.0.0.0', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

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
  });

  it('logs event=auth_missing on stderr when token required and header absent', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    cap.restore();
    expect(res.status).toBe(401);
    expect(cap.joined()).toContain('event=auth_missing');
  });

  it('logs event=auth_wrong on stderr when bearer wrong', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { Authorization: 'Bearer wrong-shh' });
    cap.restore();
    expect(res.status).toBe(401);
    expect(cap.joined()).toContain('event=auth_wrong');
  });

  it('logs event=not_found on stderr for unknown routes', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/nope`, { method: 'GET' });
    cap.restore();
    expect(res.status).toBe(404);
    expect(cap.joined()).toContain('event=not_found');
  });

  it('sets an x-tandoor-req-id header on every response', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc());
    expect(res.headers.get('x-tandoor-req-id')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('reqId in response header matches reqId in stderr log line', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/nope`, { method: 'GET' });
    cap.restore();
    const reqId = res.headers.get('x-tandoor-req-id');
    expect(reqId).toBeTruthy();
    expect(cap.joined()).toContain(`reqId=${reqId}`);
  });

  it('GET /healthz returns 200 status ok without auth even when token required', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'GET' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('does not advertise the server framework in an X-Powered-By header', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.headers.has('x-powered-by')).toBe(false);
  });

  it('sets maxConnections, headersTimeout, requestTimeout on the underlying server', async () => {
    process.env.TANDOOR_MCP_HTTP_MAX_CONNS = '64';
    handle = createHttpTransport(buildServer);
    await handle.start();

    const srv = (handle as unknown as { server(): Server }).server();
    expect(srv.maxConnections).toBe(64);
    expect(srv.headersTimeout).toBe(10_000);
    expect(srv.requestTimeout).toBe(30_000);
  });

  // Windows sometimes returns EACCES on rapid port binds; rate-limit logic is exercised on POSIX runners.
  it.skipIf(process.platform === 'win32')('rate-limits repeated failed bearer auths from same address with 429 + Retry-After', async () => {
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    onTestFinished(() => { vi.useRealTimers(); });

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

  it('answers a malformed JSON body with a 400 JSON-RPC parse error logged as a client error', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const cap = captureStderr();
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: '{not json',
    });
    const body = await res.text();
    cap.restore();
    expect(res.status).toBe(400);
    expect(JSON.parse(body)).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    expect(cap.joined()).toContain('level=info event=parse_error');
    expect(cap.joined()).not.toContain('event=internal_error');
  });

  it('serves parallel requests without transport-layer crashes and stamps distinct reqIds', async () => {
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

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

  it('has no per-visitor request limit on the local MCP path', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    onTestFinished(() => vi.useRealTimers());
    handle = createHttpTransport(buildServer);
    await handle.start();
    const port = handle.address()!.port;

    const statuses = new Set<number>();
    for (let i = 0; i < 301; i++) statuses.add((await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc())).status);
    expect([...statuses]).toEqual([200]);
  }, 30_000);

  it('stop() enters draining mode: subsequent requests return 503 shutdown envelope', async () => {
    const h = createHttpTransport(buildServer);
    await h.start();
    const port = h.address()!.port;
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

  it('returns false for a multibyte guess with the same character length but a different byte length', () => {
    expect(bearerMatches('Bearer sekr\u00e9t', 'sekret')).toBe(false);
  });

  it('returns false when scheme is missing', () => {
    expect(bearerMatches('sekret', 'sekret')).toBe(false);
  });
});

describe('jsonRpcErrorHandler', () => {
  it('answers an unexpected error with a JSON-RPC 500 and one internal_error log line without a stack', () => {
    const sent: { status?: number; headers?: Record<string, string>; body?: string } = {};
    const res = {
      getHeader: () => 'abcd1234',
      writeHead(status: number, headers: Record<string, string>) {
        sent.status = status;
        sent.headers = headers;
        return this;
      },
      end(body: string) {
        sent.body = body;
        return this;
      },
    } as unknown as Response;
    const cap = captureStderr();

    jsonRpcErrorHandler(new Error('boom'), {} as Request, res, () => {});
    cap.restore();

    expect(sent.status).toBe(500);
    expect(sent.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(sent.body!)).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
    expect(cap.lines).toEqual(['[tandoor-mcp] http reqId=abcd1234 level=error event=internal_error msg=boom\n']);
  });
});

describe('FailedAuthLimiter', () => {
  it('trips after 20 back-to-back failures from the same key', () => {
    const limiter = new FailedAuthLimiter();
    for (let i = 0; i < 20; i++) expect(limiter.consume('127.0.0.1')).toBe(true);
    expect(limiter.consume('127.0.0.1')).toBe(false);
  });
});

describe('TANDOOR_MCP_TRUST_PROXY', () => {
  let handle: HttpTransportHandle | undefined;

  beforeEach(() => {
    resetEnv();
    process.env.TANDOOR_MCP_HTTP_PORT = '0';
    process.env.TANDOOR_MCP_HTTP_TOKEN = 'sekret';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await handle?.stop();
    handle = undefined;
    resetEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  async function start(): Promise<number> {
    handle = createHttpTransport(buildServer);
    await handle.start();
    return handle.address()!.port;
  }

  const wrongBearer = (port: number, forwardedFor: string) =>
    postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { Authorization: 'Bearer wrong', 'X-Forwarded-For': forwardedFor });

  async function exhaustThenTryOther(port: number, forwardedFor: (i: number) => string, other: string): Promise<number> {
    for (let i = 0; i < 20; i++) expect((await wrongBearer(port, forwardedFor(i))).status).toBe(401);
    expect((await wrongBearer(port, forwardedFor(99))).status).toBe(429);
    return (await wrongBearer(port, other)).status;
  }

  it('keys the shared-password limiter on the trusted visitor address', async () => {
    process.env.TANDOOR_MCP_TRUST_PROXY = '1';
    const port = await start();
    expect(await exhaustThenTryOther(port, () => '203.0.113.1', '203.0.113.2')).toBe(401);
  });

  it('with 2 hops, the visitor is the second-from-right X-Forwarded-For entry', async () => {
    process.env.TANDOOR_MCP_TRUST_PROXY = '2';
    const port = await start();
    expect(await exhaustThenTryOther(port, (i) => `198.51.100.${i}, 203.0.113.1, 10.0.0.${i}`, '198.51.100.1, 203.0.113.2, 10.0.0.1')).toBe(401);
  });

  it.each([
    ['honors', '10.0.0.0/8, 127.0.0.0/8, ::1', 401],
    ['ignores', '10.0.0.0/8, 172.16.0.0/12, ::1', 429],
  ])('%s X-Forwarded-For when the socket peer is inside the proxy list %s', async (_label, list, expected) => {
    process.env.TANDOOR_MCP_TRUST_PROXY = list;
    const port = await start();
    expect(await exhaustThenTryOther(port, () => '203.0.113.1', '203.0.113.2')).toBe(expected);
  });

  it.each(['0', '', '   '])('ignores X-Forwarded-For when the value is %j', async (value) => {
    process.env.TANDOOR_MCP_TRUST_PROXY = value;
    const port = await start();
    expect(await exhaustThenTryOther(port, () => '203.0.113.1', '203.0.113.2')).toBe(429);
  });

  it.each(['true', 'abc', '-1', '1.5', '10.0.0.0/33', '::1/129', '10.0.0.1/8/8', '10.0.0.1,', 'localhost', '0.0.0.0/0', '::/0', '10.0.0.0/8, ::/0'])('refuses %j', (value) => {
    process.env.TANDOOR_MCP_TRUST_PROXY = value;
    expect(() => resolveHttpConfig()).toThrow(`TANDOOR_MCP_TRUST_PROXY must be a hop count or a comma-separated list of IP addresses and CIDR ranges (got "${value}").`);
  });

  it('logs the trusted visitor address on auth_missing', async () => {
    process.env.TANDOOR_MCP_TRUST_PROXY = '1';
    const port = await start();
    const cap = captureStderr();
    await postJson(`http://127.0.0.1:${port}/mcp`, initializeRpc(), { 'X-Forwarded-For': '203.0.113.7' });
    cap.restore();
    expect(cap.lines.find((line) => line.includes('event=auth_missing'))).toContain('remote=203.0.113.7');
  });

  it('warns once when X-Forwarded-For arrives while trust is off', async () => {
    delete process.env.TANDOOR_MCP_HTTP_TOKEN;
    const port = await start();
    const cap = captureStderr();
    await fetch(`http://127.0.0.1:${port}/healthz`, { headers: { 'X-Forwarded-For': '203.0.113.1' } });
    await fetch(`http://127.0.0.1:${port}/healthz`, { headers: { 'X-Forwarded-For': '203.0.113.2' } });
    cap.restore();
    const warnings = cap.lines.filter((line) => line.includes('TANDOOR_MCP_TRUST_PROXY'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('level=warn');
    expect(warnings[0]).toContain('all visitors may share one rate-limit bucket');
  });
});
