import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import express from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TandoorClient } from '../clients/index.js';
import { httpLog, mintReqId } from './http-log.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { accessTokenVerifier, authRouter } from './oauth/server.js';
import type { RemoteGrant } from './oauth/remote-grant.js';
import { dataDir, openStore } from './oauth/store.js';

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
  trustProxy: number | string[];
  remote: RemoteConfig | undefined;
}

interface RemoteConfig {
  publicUrl: URL;
  secretKey: Buffer;
}

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const OAUTH_ROUTES = ['/authorize', '/token', '/register', '/revoke', '/consent', '/.well-known'];
const SECRET_KEY_HINT = 'Generate one with: openssl rand -hex 32';

const DEFAULT_MAX_BODY_BYTES = 5_242_880;
const DEFAULT_MAX_CONNS = 128;
const DEFAULT_DRAIN_MS = 10_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

// Rate-limit parameters: burst 20 failed attempts, refill 10/sec.
const RL_BURST = 20;
const RL_REFILL_PER_SEC = 10;

function resolveRemoteConfig(httpPath: string, httpToken: string | undefined): RemoteConfig | undefined {
  const rawUrl = process.env.TANDOOR_MCP_PUBLIC_URL?.trim();
  if (!rawUrl) return undefined;
  if (!URL.canParse(rawUrl)) throw new Error('TANDOOR_MCP_PUBLIC_URL is not a valid URL.');
  const publicUrl = new URL(rawUrl);
  if (publicUrl.protocol !== 'https:') throw new Error(`TANDOOR_MCP_PUBLIC_URL must use https (got ${publicUrl.protocol}).`);
  if (publicUrl.username || publicUrl.password) throw new Error('TANDOOR_MCP_PUBLIC_URL must not contain a username or password.');
  if (publicUrl.href.includes('?')) throw new Error('TANDOOR_MCP_PUBLIC_URL must not contain a query string.');
  if (publicUrl.href.includes('#')) throw new Error('TANDOOR_MCP_PUBLIC_URL must not contain a fragment.');
  if (publicUrl.pathname !== httpPath) {
    throw new Error(`TANDOOR_MCP_PUBLIC_URL path "${publicUrl.pathname}" must equal TANDOOR_MCP_HTTP_PATH ("${httpPath}").`);
  }
  const lowerPath = httpPath.toLowerCase();
  if (OAUTH_ROUTES.some((route) => lowerPath === route || lowerPath.startsWith(`${route}/`))) {
    throw new Error(`TANDOOR_MCP_HTTP_PATH "${httpPath}" collides with the OAuth routes (${OAUTH_ROUTES.join(', ')}).`);
  }
  if (httpToken) throw new Error('TANDOOR_MCP_HTTP_TOKEN cannot be used with TANDOOR_MCP_PUBLIC_URL.');
  const secretKey = process.env.TANDOOR_MCP_SECRET_KEY?.trim();
  if (!secretKey) throw new Error(`TANDOOR_MCP_SECRET_KEY is required when TANDOOR_MCP_PUBLIC_URL is set. ${SECRET_KEY_HINT}`);
  if (!/^[0-9a-f]{64}$/i.test(secretKey)) {
    throw new Error(`TANDOOR_MCP_SECRET_KEY must be exactly 64 hex characters (32 bytes). ${SECRET_KEY_HINT}`);
  }
  return { publicUrl, secretKey: Buffer.from(secretKey, 'hex') };
}

function isProxyAddress(entry: string): boolean {
  const [address = '', prefix, extra] = entry.split('/');
  const maxPrefix = isIP(address) === 4 ? 32 : 128;
  return isIP(address) > 0 && extra === undefined && (prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= maxPrefix));
}

function resolveTrustProxy(): number | string[] {
  const raw = process.env.TANDOOR_MCP_TRUST_PROXY?.trim() ?? '';
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const entries = raw.split(',').map((entry) => entry.trim());
  if (!entries.every(isProxyAddress)) {
    throw new Error(`TANDOOR_MCP_TRUST_PROXY must be a hop count or a comma-separated list of IP addresses and CIDR ranges (got "${raw}").`);
  }
  return entries;
}

export function resolveHttpConfig(): HttpConfig {
  const portRaw = process.env.TANDOOR_MCP_HTTP_PORT;
  const rawToken = process.env.TANDOOR_MCP_HTTP_TOKEN;
  const token = rawToken?.trim() ? rawToken : undefined;
  const pathRaw = process.env.TANDOOR_MCP_HTTP_PATH;
  const maxBodyRaw = process.env.TANDOOR_MCP_HTTP_MAX_BODY_BYTES;
  const maxConnsRaw = process.env.TANDOOR_MCP_HTTP_MAX_CONNS;
  const drainRaw = process.env.TANDOOR_MCP_HTTP_DRAIN_MS;
  const path = pathRaw || '/mcp';
  return {
    port: portRaw ? Number(portRaw) : 3737,
    host: process.env.TANDOOR_MCP_HTTP_HOST?.trim() || '127.0.0.1',
    requireAuth: Boolean(token),
    token,
    path,
    maxBodyBytes: maxBodyRaw ? Number(maxBodyRaw) : DEFAULT_MAX_BODY_BYTES,
    maxConnections: maxConnsRaw ? Number(maxConnsRaw) : DEFAULT_MAX_CONNS,
    headersTimeoutMs: HEADERS_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    drainMs: drainRaw ? Number(drainRaw) : DEFAULT_DRAIN_MS,
    trustProxy: resolveTrustProxy(),
    remote: resolveRemoteConfig(path, token),
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
  const supplied = Buffer.from(header.slice(prefix.length));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function forbid(res: ServerResponse, event: string, meta: Record<string, string>): void {
  httpLog(mintReqId(), 'warn', event, Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.slice(0, 64)])));
  jsonRpcError(res, 403, -32000, 'Forbidden');
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string, data?: unknown, extraHeaders: Record<string, string> = {}): void {
  const payload: Record<string, unknown> = { jsonrpc: '2.0', id: null, error: { code, message } };
  if (data !== undefined) (payload.error as Record<string, unknown>).data = data;
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

export function jsonRpcErrorHandler(err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction): void {
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const clientStatus = [status, statusCode].find((s): s is number => typeof s === 'number' && s >= 400 && s < 500);
  if (clientStatus) {
    jsonRpcError(res, clientStatus, -32600, 'Invalid Request');
    return;
  }
  httpLog(String(res.getHeader('x-tandoor-req-id')), 'error', 'internal_error', { msg: err instanceof Error ? err.message : String(err) });
  jsonRpcError(res, 500, -32603, 'Internal error');
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class FailedAuthLimiter {
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

export function createHttpTransport(serve: { remote: (client: TandoorClient) => McpServer } | (() => McpServer), tandoorUrl?: string, tandoorPublicUrl?: string): HttpTransportHandle {
  const cfg = resolveHttpConfig();
  const expected = cfg.token ?? '';
  const limiter = new FailedAuthLimiter();
  const live = new Set<McpServer>();

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

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  const publicUrl = cfg.remote?.publicUrl;
  if (publicUrl) {
    app.use((req, res, next) => {
      const host = URL.parse(`${publicUrl.protocol}//${req.headers.host}`);
      if (host?.host === publicUrl.host || LOOPBACK_HOSTNAMES.includes(host?.hostname ?? '')) return next();
      forbid(res, 'host_rejected', { host: String(req.headers.host), hint: 'if behind nginx, set proxy_set_header Host $host' });
    });
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (req.path !== cfg.path || origin === undefined) return next();
    const allowed = publicUrl ? origin === publicUrl.origin : LOOPBACK_HOSTNAMES.includes(URL.parse(origin)?.hostname ?? '');
    if (allowed) return next();
    forbid(res, 'origin_rejected', { origin });
  });
  let warnedUntrustedForward = false;
  app.use((req, _res, next) => {
    if (cfg.trustProxy === 0 && !warnedUntrustedForward && req.headers['x-forwarded-for']) {
      warnedUntrustedForward = true;
      httpLog(mintReqId(), 'warn', 'forwarded_header_untrusted', { hint: 'X-Forwarded-For seen but TANDOOR_MCP_TRUST_PROXY is not set, so all visitors may share one rate-limit bucket' });
    }
    next();
  });
  if (cfg.remote && publicUrl) {
    if (!tandoorUrl) throw new Error('Remote mode needs the Tandoor URL.');
    const { secretKey } = cfg.remote;
    const store = openStore({ dir: dataDir(process.env), key: secretKey });
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(publicUrl);
    const verifier = accessTokenVerifier(store, resourceMetadataUrl);
    app.use(authRouter({ publicUrl, secretKey, tandoorUrl, tandoorPublicUrl: tandoorPublicUrl ?? tandoorUrl, store, verifier }));
    const bearerAuth = requireBearerAuth({ verifier, requiredScopes: ['tandoor'], resourceMetadataUrl, expectedResource: publicUrl });
    app.use((req, res, next) => {
      if (req.method !== 'POST' || req.path !== cfg.path) return next();
      if (draining) return jsonRpcError(res, 503, -32000, 'Shutting down');
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'www-authenticate' ? String(value).replace('Bearer ', 'Bearer realm="tandoor-mcp", ') : value);
      const status = res.status.bind(res);
      res.status = (code) => {
        if (code !== 401 || limiter.consume(req.ip ?? 'unknown')) return status(code);
        res.setHeader('Retry-After', '5');
        return status(429);
      };
      return bearerAuth(req, res, next);
    });
  }
  app.use(async (req, res) => {
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
        httpLog(reqId, 'info', 'auth_missing', { remote: req.ip });
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="tandoor-mcp"', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }));
        return;
      }
      if (!bearerMatches(header, expected)) {
        const remote = req.ip ?? 'unknown';
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
          const server = typeof serve === 'function' ? serve() : serve.remote(new TandoorClient({ url: tandoorUrl!, token: (req.auth!.extra as RemoteGrant).tandoorToken }));
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: Boolean(cfg.remote) });
          live.add(server);
          res.on('close', () => {
            live.delete(server);
            server.close();
          });
          await server.connect(transport);
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

      if (urlPath === cfg.path) {
        httpLog(reqId, 'info', 'method_not_allowed', { method: req.method, path: urlPath });
        jsonRpcError(res, 405, -32000, 'Method not allowed', undefined, { Allow: 'POST' });
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
  app.use(jsonRpcErrorHandler);

  const httpServer: Server = createServer(app);
  httpServer.maxConnections = cfg.maxConnections;
  httpServer.headersTimeout = cfg.headersTimeoutMs;
  httpServer.requestTimeout = cfg.requestTimeoutMs;

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(cfg.port, cfg.host, () => {
          httpServer.off('error', reject);
          resolve();
        });
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
      await Promise.all([...live].map((s) => s.close()));
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
