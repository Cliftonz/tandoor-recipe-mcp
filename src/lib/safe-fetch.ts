// SSRF-safe fetch wrapper. Defends LLM-supplied URLs from reaching:
//   - Loopback (127.0.0.0/8, ::1)
//   - Link-local (169.254.0.0/16, fe80::/10) — includes cloud IMDS endpoints
//   - Private networks (10/8, 172.16/12, 192.168/16, fc00::/7, fd00::/8)
//   - Unspecified addresses (0.0.0.0, ::)
//
// Threat: a prompt-injected LLM is fed a URL like `http://169.254.169.254/...`
// (AWS/GCE/Azure metadata service) or `http://127.0.0.1:9200/_cluster/state`
// (local Elasticsearch). The bytes flow into the MCP response and the LLM
// can echo them back into the conversation — credentials leaked.
//
// Defense: resolve the host via DNS BEFORE connecting AND pin the resolved
// address into undici's dispatcher so the actual fetch connects to the
// *exact* IP we validated. Without pinning, undici resolves DNS again
// internally and a short-TTL attacker can flip the answer between our
// validation and the connect — that's the classic DNS-rebinding bypass.
// Re-validate every redirect hop. The previous implementation used a
// mutable module-scope resolver export which (a) didn't pin the connect
// and (b) was a supply-chain risk; both are fixed here.
//
// Configuration:
//   TANDOOR_MCP_ALLOW_PRIVATE_FETCH=1 — narrow opt-out: still resolves DNS,
//     still blocks IMDS/link-local, but permits literal loopback / RFC1918
//     for test stubs. Hostnames are NOT auto-allowed under this env (the
//     prior behavior was to skip DNS entirely, which was a much wider hole
//     than the docstring implied — see R3 security F2).

import { lookup as defaultDnsLookup } from 'node:dns/promises';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export class SsrfBlockedError extends Error {
  readonly url: string;
  readonly reason: string;
  constructor(url: string, reason: string) {
    super(`SSRF guard blocked ${url}: ${reason}`);
    this.name = 'SsrfBlockedError';
    this.url = url;
    this.reason = reason;
  }
}

export type ResolverFn = (host: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>;

export interface SafeFetchOptions {
  /** Override the DNS resolver. Tests inject a controlled resolver. */
  resolver?: ResolverFn;
  /** Max redirect hops (default 5). Each hop is re-validated. */
  maxRedirects?: number;
  /** Per-DNS-lookup timeout in ms (default 2000). Guards against slow-DoS. */
  dnsTimeoutMs?: number;
  /**
   * Strict mode ignores TANDOOR_MCP_ALLOW_PRIVATE_FETCH. Used for Tandoor-
   * delegated URLs that the user supplies via tool args — those flow into
   * Tandoor's own scraper and must never reach loopback even in dev.
   */
  strict?: boolean;
  /** Override environment lookup. Tests inject so process.env isn't mutated. */
  env?: NodeJS.ProcessEnv;
}

/**
 * True when `ip` is in a forbidden range. Pure function — exposed for tests.
 *
 * IPv4 checks the four classic private blocks + loopback + link-local +
 * unspecified. IPv6 checks ::1, ::, fe80::/10 (link-local), and fc00::/7
 * (unique local — includes fc00::/8 and fd00::/8).
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number, number, number];
    if (a === 127) return true;          // loopback
    if (a === 10) return true;            // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;          // private
    if (a === 169 && b === 254) return true;          // link-local (IMDS)
    if (a === 0) return true;                          // unspecified
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;     // loopback
    if (lower === '::') return true;       // unspecified
    if (isLinkLocalIPv6(lower)) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
    const v4 = ip.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4 && isPrivateIp(v4[1]!)) return true;
    return false;
  }
  // Not a parseable IP — refuse to make a decision; treat as forbidden so a
  // malformed input doesn't fall through to the network layer.
  return true;
}

function isLinkLocalIPv6(lower: string): boolean {
  // fe80::/10 covers fe80–febf in the first-byte high nibble.
  return lower.startsWith('fe8') || lower.startsWith('fe9') ||
         lower.startsWith('fea') || lower.startsWith('feb');
}

/**
 * Always-forbidden IPs — even when TANDOOR_MCP_ALLOW_PRIVATE_FETCH=1.
 * These are cloud metadata services that have no legitimate test/dev use
 * case and represent the highest-value exfil target (instance credentials).
 */
function isAlwaysForbidden(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number) as [number, number, number, number];
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local (IMDS)
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (isLinkLocalIPv6(lower)) return true;
    const v4 = ip.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4 && isAlwaysForbidden(v4[1]!)) return true;
    return false;
  }
  return true; // unparseable → conservative
}

async function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(msg)), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ValidatedUrl {
  parsed: URL;
  /** The IP we'll pin into the dispatcher so connect uses what we validated. */
  pinnedAddress: string;
  pinnedFamily: 4 | 6;
}

/**
 * Validate a URL and resolve its host to the address we'll connect to.
 * Both the validation and the connect use the SAME address — no DNS
 * rebinding window between the two lookups. Exported so callers that
 * forward URLs to a downstream service (e.g. Tandoor's own scraper) can
 * pre-check without making a network call.
 */
export async function assertPublicUrl(rawUrl: string, opts: SafeFetchOptions = {}): Promise<URL> {
  const v = await validateAndPin(rawUrl, { ...opts, strict: true });
  return v.parsed;
}

async function validateAndPin(rawUrl: string, opts: SafeFetchOptions): Promise<ValidatedUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl, 'malformed URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(rawUrl, `unsupported scheme ${parsed.protocol}`);
  }
  const env = opts.env ?? process.env;
  // node:dns/promises.lookup is overloaded; cast to our narrow shape so
  // the all:true branch is selected at the type level too.
  const resolver: ResolverFn = opts.resolver ?? (defaultDnsLookup as unknown as ResolverFn);
  const dnsTimeoutMs = opts.dnsTimeoutMs ?? 2000;
  // Strict mode ignores the opt-out. Used by Tandoor-delegated URL pre-checks
  // where loopback must never be reachable even in dev.
  const allowPrivate = !opts.strict && env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH === '1';
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  // Test-only escape hatch: unit tests that mock fetch and use RFC-6761
  // reserved TLDs (.test, .example, .invalid, .localhost) cannot rely on
  // real DNS. When the test env is set AND the hostname is a reserved
  // TLD, skip the DNS check — the mocked fetch never reaches a real host
  // so there's no SSRF risk. Production callers must never set this; the
  // env var name encodes that.
  const isReservedTld = /\.(test|example|invalid|localhost)$/i.test(host) || host === 'localhost';
  if (env.TANDOOR_MCP_TEST_SKIP_URL_CHECK === '1' && isReservedTld) {
    return { parsed, pinnedAddress: '127.0.0.1', pinnedFamily: 4 };
  }

  let resolved: { address: string; family: number }[] = [];
  if (net.isIP(host) !== 0) {
    resolved = [{ address: host, family: net.isIPv4(host) ? 4 : 6 }];
  } else {
    try {
      resolved = await withTimeout(
        resolver(host, { all: true }),
        dnsTimeoutMs,
        `dns lookup timed out after ${dnsTimeoutMs}ms`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SsrfBlockedError(rawUrl, `dns lookup failed: ${msg}`);
    }
  }
  if (resolved.length === 0) {
    // NODATA / empty A+AAAA. Refuse — otherwise undici's connect would
    // perform its own DNS query, which is exactly the rebinding window
    // we're trying to close.
    throw new SsrfBlockedError(rawUrl, 'dns returned no addresses');
  }

  // The opt-out narrowing: even when allowPrivate is on, a non-IP hostname
  // is only allowed to land in private space if EVERY one of its resolved
  // addresses is a recognized local literal (127.0.0.1, ::1) or a
  // documented dev host (host.docker.internal). Public hostnames that
  // happen to resolve into private space (DNS rebinding, internal corp
  // names, attacker.com → 127.0.0.1) are still rejected.
  const isLiteralLocal = host === '127.0.0.1' || host === '::1' ||
                         host === 'localhost' || host === 'host.docker.internal';

  for (const r of resolved) {
    if (isAlwaysForbidden(r.address)) {
      const phrase = host === r.address ? `host ${host} is always-forbidden` : `host ${host} resolves to always-forbidden ${r.address}`;
      throw new SsrfBlockedError(rawUrl, phrase);
    }
    if (isPrivateIp(r.address)) {
      if (allowPrivate && (isLiteralLocal || net.isIP(host) !== 0)) {
        continue; // dev / test opt-out
      }
      const phrase = host === r.address ? `host ${host} is in a forbidden range` : `host ${host} resolves to forbidden ${r.address}`;
      throw new SsrfBlockedError(rawUrl, phrase);
    }
  }

  // Pin to the first acceptable address. For multi-record hosts the order
  // is whatever the resolver gave back; both addresses passed the checks
  // above so any is safe to use.
  const first = resolved[0]!;
  return {
    parsed,
    pinnedAddress: first.address,
    pinnedFamily: first.family === 6 ? 6 : 4,
  };
}

/**
 * SSRF-safe `fetch`. Validates host (and every redirect hop) lives outside
 * loopback/RFC1918/link-local AND uses an undici Agent with `connect.lookup`
 * pinned to the validated address — so undici's internal DNS cannot rebind
 * between validation and connect.
 *
 * Throws `SsrfBlockedError` on any refused host.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {},
): Promise<Response> {
  if (init.redirect !== undefined && init.redirect !== 'manual') {
    throw new Error('safeFetch manages redirects internally; do not pass init.redirect');
  }
  const maxRedirects = opts.maxRedirects ?? 5;
  const env = opts.env ?? process.env;
  // When the documented test-skip env is set, fall through to globalThis.fetch
  // so unit tests can `vi.spyOn(globalThis, 'fetch')` and intercept network
  // calls without spawning real stubs. We still validate (skipping DNS only
  // for reserved TLDs), just don't pin via undici.
  const testSkip = env.TANDOOR_MCP_TEST_SKIP_URL_CHECK === '1';
  let current = url;
  // Drop credentials (Authorization + Cookie) on cross-origin redirects to
  // prevent a redirect from leaking the bearer to a partner CDN / attacker
  // host. The web Fetch spec already does this for redirect: 'follow' but
  // we use 'manual' to re-validate per hop, so we have to enforce it
  // ourselves. Today no caller passes Authorization to safeFetch — this is
  // defensive against future callers adding one (e.g. authenticated recipe
  // imports from gated sites).
  let currentInit: RequestInit = { ...init };
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const v = await validateAndPin(current, opts);
    let res: Response;
    if (testSkip) {
      res = await fetch(current, { ...currentInit, redirect: 'manual' });
    } else {
      const agent = new Agent({
        connect: {
          // undici may call lookup with either { all: true } (expects an
          // array callback) or the legacy single-result form. Handle both.
          lookup: (_hostname: string, lookupOpts: any, cb: any) => {
            if (lookupOpts && lookupOpts.all) {
              cb(null, [{ address: v.pinnedAddress, family: v.pinnedFamily }]);
            } else {
              cb(null, v.pinnedAddress, v.pinnedFamily);
            }
          },
        },
      });
      // Use undici's fetch directly so the custom dispatcher is honored
      // (the global fetch in Node 24 rejected `dispatcher: ...` with an
      // InvalidArgumentError). Cast to web Response since undici and node
      // share the same Fetch spec shape at the type level.
      res = (await undiciFetch(current, {
        ...(currentInit as any),
        redirect: 'manual',
        dispatcher: agent,
      })) as unknown as Response;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res; // 3xx without Location: pass through verbatim
      // Resolve relative redirects against current URL (incl. protocol-relative).
      const next = new URL(loc, current).toString();
      // Cross-origin? Drop credentials before re-firing. We don't know
      // which header is sensitive in the abstract; strip the well-known
      // ones (Authorization, Cookie, Proxy-Authorization) plus anything
      // matching `*token*` / `*api-key*` defensively. The Fetch spec also
      // drops these for same-scheme cross-origin; we apply the same.
      if (new URL(next).origin !== new URL(current).origin) {
        currentInit = stripCredentialsHeaders(currentInit);
      }
      current = next;
      continue;
    }
    return res;
  }
  throw new SsrfBlockedError(url, `exceeded ${maxRedirects} redirects`);
}

/** Return a copy of `init` with credential-bearing headers removed. */
function stripCredentialsHeaders(init: RequestInit): RequestInit {
  const headers = init.headers;
  if (!headers) return init;
  const isSensitive = (k: string) => {
    const lower = k.toLowerCase();
    return lower === 'authorization' || lower === 'cookie' || lower === 'proxy-authorization' ||
           lower.includes('token') || lower.includes('api-key') || lower.includes('apikey');
  };
  let next: HeadersInit;
  if (headers instanceof Headers) {
    next = new Headers(headers);
    for (const [k] of headers) if (isSensitive(k)) (next as Headers).delete(k);
  } else if (Array.isArray(headers)) {
    next = headers.filter(([k]) => !isSensitive(k));
  } else {
    next = {} as Record<string, string>;
    for (const [k, v] of Object.entries(headers as Record<string, string>)) {
      if (!isSensitive(k)) (next as Record<string, string>)[k] = v;
    }
  }
  return { ...init, headers: next };
}

/**
 * Byte-capped fetch wrapper. Refuses oversized responses before reading the
 * body into memory. Use for upload handlers that buffer the entire response
 * — a hostile content-length header is a cheap DoS vector otherwise.
 */
export async function safeFetchBytes(
  url: string,
  init: RequestInit = {},
  opts: SafeFetchOptions & { maxBytes: number },
): Promise<{ res: Response; bytes: Uint8Array }> {
  const res = await safeFetch(url, init, opts);
  if (!res.ok) return { res, bytes: new Uint8Array() };
  const cl = res.headers.get('content-length');
  if (cl) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > opts.maxBytes) {
      throw new SsrfBlockedError(url, `content-length ${n} exceeds maxBytes ${opts.maxBytes}`);
    }
  }
  // Stream and cap. Some servers omit Content-Length (chunked transfer);
  // the running-total check catches them too.
  const reader = res.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > opts.maxBytes) {
      throw new SsrfBlockedError(url, `response ${bytes.byteLength}B exceeds maxBytes ${opts.maxBytes}`);
    }
    return { res, bytes };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > opts.maxBytes) {
      await reader.cancel();
      throw new SsrfBlockedError(url, `response exceeded maxBytes ${opts.maxBytes}`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return { res, bytes: out };
}
