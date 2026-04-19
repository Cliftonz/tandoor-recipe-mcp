// Base HTTP client for making requests to Tandoor API.

import { TandoorConfig } from '../types/index.js';

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
const MAX_RETRIES = 3;

function shouldRetry(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    // Don't set Content-Type for FormData — fetch picks the correct multipart
    // boundary string itself. Forcing application/json breaks multipart uploads.
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers as Record<string, string>) || {}),
    };
    const isIdempotentBody = isFormData ? false : true; // JSON bodies are safe to replay; we don't retry streams.

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        // Retry on transient 5xx / 429 before reading the body.
        if (shouldRetry(response.status) && attempt < MAX_RETRIES && isIdempotentBody) {
          const wait = backoffMs(attempt, response.headers.get('retry-after'));
          await sleep(wait);
          continue;
        }

        // Read body exactly once — Response body is a single-use stream.
        const bodyText = await response.text();

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
        // Network errors (DNS failure, socket reset) — worth retrying.
        const isNetwork = error instanceof TypeError || (error as any)?.name === 'FetchError';
        if (isNetwork && attempt < MAX_RETRIES && isIdempotentBody) {
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
