import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { httpLog, mintReqId } from './http-log.js';

export interface HttpConfig {
  port: number;
  host: string;
  requireAuth: boolean;
  token: string | undefined;
  path: string;
  maxBodyBytes: number;
  maxConnections: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  drainMs: number;
}

const DEFAULT_MAX_BODY_BYTES = 5_242_880;
const DEFAULT_MAX_CONNS = 128;
const DEFAULT_DRAIN_MS = 10_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

// Rate-limit parameters: burst 20 failed attempts, refill 10/sec.
const RL_BURST = 20;
const RL_REFILL_PER_SEC = 10;

export function resolveHttpConfig(): HttpConfig {
  const portRaw = process.env.TANDOOR_MCP_HTTP_PORT;
  const token = process.env.TANDOOR_MCP_HTTP_TOKEN;
  const pathRaw = process.env.TANDOOR_MCP_HTTP_PATH;
  const maxBodyRaw = process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES;
  const maxConnsRaw = process.env.TANDOOR_MCP_HTTP_MAX_CONNS;
  const drainRaw = process.env.TANDOOR_MCP_HTTP_DRAIN_MS;
  return {
    port: portRaw ? Number(portRaw) : 3737,
    host: '127.0.0.1',
    requireAuth: Boolean(token),
    token,
    path: pathRaw || '/mcp',
    maxBodyBytes: maxBodyRaw ? Number(maxBodyRaw) : DEFAULT_MAX_BODY_BYTES,
    maxConnections: maxConnsRaw ? Number(maxConnsRaw) : DEFAULT_MAX_CONNS,
    headersTimeoutMs: HEADERS_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    drainMs: drainRaw ? Number(drainRaw) : DEFAULT_DRAIN_MS,
  };
}

export interface HttpTransportHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  address(): AddressInfo | null;
  server(): Server;
}

class PayloadTooLargeError extends Error {
  readonly maxBytes: number;
  constructor(maxBytes: number) {
    super('payload_too_large');
    this.maxBytes = maxBytes;
  }
}

function readBody(req: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let acc = '';
    let total = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > maxBodyBytes) {
        aborted = true;
        reject(new PayloadTooLargeError(maxBodyBytes));
        return;
      }
      acc += decoder.write(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      acc += decoder.end();
      resolve(acc);
    });
    req.on('error', (err) => {
      if (aborted) return;
      reject(err);
    });
  });
}

export function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header) return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  const supplied = header.slice(prefix.length);
  if (supplied.length !== expected.length) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string, data?: unknown, extraHeaders: Record<string, string> = {}): void {
  const payload: Record<string, unknown> = { jsonrpc: '2.0', id: null, error: { code, message } };
  if (data !== undefined) (payload.error as Record<string, unknown>).data = data;
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

class FailedAuthLimiter {
  private buckets = new Map<string, Bucket>();

  consume(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b) {
      // First failure spends 1 of RL_BURST tokens.
      this.buckets.set(key, { tokens: RL_BURST - 1, updatedAt: now });
      return true;
    }
    const elapsed = (now - b.updatedAt) / 1000;
    const refilled = Math.min(RL_BURST, b.tokens + elapsed * RL_REFILL_PER_SEC);
    if (refilled < 1) {
      b.tokens = refilled;
      b.updatedAt = now;
      return false;
    }
    b.tokens = refilled - 1;
    b.updatedAt = now;
    return true;
  }

  clear(): void {
    this.buckets.clear();
  }
}

export function createHttpTransport(server: McpServer): HttpTransportHandle {
  const cfg = resolveHttpConfig();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const expected = cfg.token ?? '';
  const limiter = new FailedAuthLimiter();

  let draining = false;
  let inFlight = 0;
  let drainResolve: (() => void) | undefined;

  function trackStart(res: ServerResponse) {
    inFlight++;
    res.on('close', () => {
      inFlight--;
      if (draining && inFlight === 0 && drainResolve) drainResolve();
    });
  }

  const httpServer: Server = createServer(async (req, res) => {
    const reqId = mintReqId();
    res.setHeader('x-tandoor-req-id', reqId);
    trackStart(res);

    if (draining) {
      jsonRpcError(res, 503, -32000, 'Shutting down');
      return;
    }

    const urlPath = (req.url ?? '').split('?')[0] ?? '';
    const isHealthz = req.method === 'GET' && urlPath.toLowerCase() === '/healthz';
    if (isHealthz) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (cfg.requireAuth) {
      const header = req.headers.authorization;
      if (!header) {
        httpLog(reqId, 'info', 'auth_missing', { remote: req.socket.remoteAddress });
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="tandoor-mcp"', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }));
        return;
      }
      if (!bearerMatches(header, expected)) {
        const remote = req.socket.remoteAddress ?? 'unknown';
        const allowed = limiter.consume(remote);
        if (!allowed) {
          httpLog(reqId, 'warn', 'auth_rate_limited', { remote });
          jsonRpcError(res, 429, -32000, 'Too many auth failures', undefined, { 'Retry-After': '5' });
          return;
        }
        httpLog(reqId, 'info', 'auth_wrong', { remote });
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="tandoor-mcp"', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }));
        return;
      }
    }

    try {
      if (req.method === 'POST' && urlPath === cfg.path) {
        try {
          const raw = await readBody(req, cfg.maxBodyBytes);
          const parsed = raw.length > 0 ? JSON.parse(raw) : undefined;
          await transport.handleRequest(req, res, parsed);
        } catch (err) {
          if (err instanceof PayloadTooLargeError) {
            httpLog(reqId, 'warn', 'payload_too_large', { max_bytes: err.maxBytes });
            req.resume();
            jsonRpcError(res, 413, -32600, 'payload too large', { max_bytes: err.maxBytes });
            return;
          }
          throw err;
        }
        return;
      }

      if (req.method === 'GET' && urlPath === cfg.path) {
        await transport.handleRequest(req, res);
        return;
      }

      httpLog(reqId, 'info', 'not_found', { method: req.method, path: urlPath });
      res.writeHead(404).end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      httpLog(reqId, 'error', 'internal_error', { msg });
      if (!res.headersSent) {
        jsonRpcError(res, 500, -32603, 'Internal error');
      } else {
        res.destroy();
      }
    }
  });

  httpServer.maxConnections = cfg.maxConnections;
  httpServer.headersTimeout = cfg.headersTimeoutMs;
  httpServer.requestTimeout = cfg.requestTimeoutMs;

  return {
    async start() {
      await server.connect(transport);
      await new Promise<void>((resolve) => {
        httpServer.listen(cfg.port, cfg.host, () => resolve());
      });
    },
    async stop() {
      draining = true;
      httpLog('00000000', 'info', 'shutdown');
      if (inFlight > 0) {
        await new Promise<void>((resolve) => {
          drainResolve = resolve;
          const t = setTimeout(() => {
            httpLog('00000000', 'warn', 'shutdown_drain_deadline', { in_flight: inFlight });
            resolve();
          }, cfg.drainMs);
          t.unref();
        });
      }
      await transport.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      limiter.clear();
    },
    address() {
      return httpServer.address() as AddressInfo | null;
    },
    server() {
      return httpServer;
    },
  };
}
