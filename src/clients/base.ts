// Base HTTP client for making requests to Tandoor API.

import { TandoorConfig } from '../types/index.js';

// ---------- Optional request/response/error trace logging ----------
// `TANDOOR_MCP_LOG=request,response,error` (or `all`) enables stderr traces
// with the bearer token redacted. Defaults to silent. stderr not stdout
// because stdout belongs to the MCP transport.

const LOG_MODES = (() => {
  const raw = (process.env.TANDOOR_MCP_LOG || '').toLowerCase();
  if (!raw) return new Set<string>();
  if (raw === 'all') return new Set(['request', 'response', 'error']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
})();

function logRequest(method: string, url: string, bodyPreview?: string): void {
  if (!LOG_MODES.has('request')) return;
  const body = bodyPreview ? ` ${bodyPreview.slice(0, 200)}` : '';
  console.error(`[tandoor-mcp] → ${method} ${url}${body}`);
}

function logResponse(method: string, url: string, status: number, bodyPreview: string): void {
  if (!LOG_MODES.has('response')) return;
  const snippet = bodyPreview.slice(0, 200).replace(/\n/g, ' ');
  console.error(`[tandoor-mcp] ← ${method} ${url} ${status}${snippet ? ' ' + snippet : ''}`);
}

function logError(method: string, url: string, err: unknown): void {
  if (!LOG_MODES.has('error')) return;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[tandoor-mcp] ✗ ${method} ${url} ${msg}`);
}

/**
 * Strip a bearer token out of any string we might echo back to the caller.
 * If Tandoor (or an upstream proxy) ever reflects request headers in the
 * error body, we don't want that token to surface in MCP error messages or
 * client-side logs.
 */
export function redactToken(text: string, token: string): string {
  if (!text || !token) return text;
  // Replace both raw token and `Bearer <token>` forms.
  return text
    .split(`Bearer ${token}`).join('Bearer ***REDACTED***')
    .split(token).join('***REDACTED***');
}

/** Statuses worth retrying with backoff. Everything else fails fast. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;

function shouldRetry(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Subclass-visible options that extend RequestInit with Tandoor-specific knobs.
 * `maxRetries` lets callers cap retry amplification on secondary fan-out calls
 * (e.g. hydration GETs done before a write) so one flaky backend doesn't burn
 * the full budget on an auxiliary read.
 */
export interface TandoorRequestOptions extends RequestInit {
  maxRetries?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Back off with jitter. Honors the Retry-After header when Tandoor / reverse
 * proxies send one (common for 429).
 */
function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const asNumber = Number(retryAfterHeader);
    if (Number.isFinite(asNumber)) return Math.min(asNumber * 1000, 30_000);
    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  }
  const base = 300 * Math.pow(2, attempt); // 300, 600, 1200 ms
  return base + Math.floor(Math.random() * 200);
}

export class BaseClient {
  protected baseUrl: string;
  protected token: string;

  constructor(config: TandoorConfig) {
    // Add https:// if no protocol specified
    let url = config.url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
    this.token = config.token;
  }

  protected async request<T>(
    endpoint: string,
    options: TandoorRequestOptions = {}
  ): Promise<T> {
    const method = options.method || 'GET';
    const url = `${this.baseUrl}${endpoint}`;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    // Don't set Content-Type for FormData — fetch picks the correct multipart
    // boundary string itself. Forcing application/json breaks multipart uploads.
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers as Record<string, string>) || {}),
    };
    const isIdempotentBody = isFormData ? false : true; // JSON bodies are safe to replay; we don't retry streams.
    const bodyPreview = typeof options.body === 'string'
      ? redactToken(options.body, this.token)
      : undefined;

    // Aborts skip retry — abort means "stop". Track once per call.
    const signal = options.signal;

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('Request aborted');
      }
      try {
        logRequest(method, url, bodyPreview);
        const response = await fetch(url, { ...options, headers });

        // Retry on transient 5xx / 429 before reading the body.
        if (shouldRetry(response.status) && attempt < maxRetries && isIdempotentBody && !signal?.aborted) {
          const wait = backoffMs(attempt, response.headers.get('retry-after'));
          await sleep(wait);
          continue;
        }

        // Read body exactly once — Response body is a single-use stream.
        const bodyText = await response.text();
        logResponse(method, url, response.status, bodyText);

        if (!response.ok) {
          let errorMessage = `Tandoor API error: ${response.status} ${response.statusText}`;

          if (bodyText.length > 0) {
            try {
              const errorData = JSON.parse(bodyText);
              if (errorData.detail) {
                errorMessage += `\nDetail: ${errorData.detail}`;
              } else if (typeof errorData === 'object') {
                errorMessage += `\n${JSON.stringify(errorData, null, 2)}`;
              }
            } catch {
              errorMessage += `\n${bodyText}`;
            }
          }

          // Friendly guidance for common errors.
          if (response.status === 401) {
            errorMessage += '\n\nAuthentication failed. Please check your TANDOOR_TOKEN is valid.';
          } else if (response.status === 403) {
            errorMessage += '\n\nAccess forbidden. Your API token may not have the required permissions.';
          } else if (response.status === 404) {
            errorMessage += '\n\nResource not found. Please check the ID or URL is correct.';
          } else if (response.status === 500) {
            errorMessage += '\n\nServer error. Please check your Tandoor instance logs for details.';
          }

          throw new Error(redactToken(errorMessage, this.token));
        }

        // Handle 204 No Content and any other empty body (e.g. DELETE)
        if (response.status === 204 || bodyText.length === 0) {
          return undefined as T;
        }

        try {
          return JSON.parse(bodyText) as T;
        } catch {
          throw new Error(
            redactToken(`Tandoor returned non-JSON (${response.status}): ${bodyText.slice(0, 200)}`, this.token)
          );
        }
      } catch (error) {
        lastError = error;
        logError(method, url, error);
        // Aborts propagate immediately — never retry a cancelled request.
        if (signal?.aborted || (error as any)?.name === 'AbortError') {
          throw error;
        }
        // Network errors (DNS failure, socket reset) — worth retrying.
        const isNetwork = error instanceof TypeError || (error as any)?.name === 'FetchError';
        if (isNetwork && attempt < maxRetries && isIdempotentBody) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        if (error instanceof Error) {
          // Re-throw our formatted errors as-is (already redacted).
          if (error.message.includes('Tandoor API error') || error.message.includes('Tandoor returned non-JSON')) {
            throw error;
          }
          // Wrap other errors (e.g. fetch TypeError on DNS failure).
          throw new Error(
            redactToken(
              `Failed to connect to Tandoor: ${error.message}\nPlease check TANDOOR_URL is correct and the server is accessible.`,
              this.token
            )
          );
        }
        throw error;
      }
    }
    // Unreachable under normal flow — the for-loop either returns or throws.
    throw lastError instanceof Error ? lastError : new Error('Unknown request failure');
  }
}
