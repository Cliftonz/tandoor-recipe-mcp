// Shared helpers used across every handler file. Before this module existed,
// each handler rolled its own `slimPage` / nested-id-envelope / JSON emit
// inline — 150+ lines of subtly-different copies. Centralising them keeps
// response shapes consistent and makes format tweaks one-file changes.

import { z } from 'zod';

/**
 * Guard for PATCH handlers: refuses to send an empty body, which Tandoor
 * accepts as a no-op that still burns a round trip. Message wording is
 * asserted by tests — do not change it.
 */
export function assertNonEmptyBody(body: Record<string, unknown>): void {
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
}

/**
 * Shared `format` input shape used by every list/get tool: `slim` (default,
 * projected shape) or `full` (raw API response).
 */
export const formatEnum = z.enum(['slim', 'full']).optional();

/**
 * JSON-serialize compactly. Pretty-printing costs ~40% more tokens on the
 * MCP wire and MCP clients re-format for display anyway.
 */
export const emit = (o: unknown): string => JSON.stringify(o);

/**
 * Slim a Tandoor paginated response by mapping each `result` through the
 * supplied slimmer, preserving count/next/previous for pagination.
 * Returns the raw page unchanged if it doesn't look paginated (so callers can
 * use this even when the endpoint might return an array).
 */
export function slimPaginated<T, U>(
  page: unknown,
  slim: (item: T) => U
): { count: number; next: string | null; previous: string | null; results: U[] } | unknown {
  const p = page as { count?: number; next?: string | null; previous?: string | null; results?: T[] };
  if (!p || !Array.isArray(p.results)) return page;
  return {
    count: p.count ?? p.results.length,
    next: p.next ?? null,
    previous: p.previous ?? null,
    results: p.results.map(slim),
  };
}

/**
 * Map a possibly-paginated response through a slimmer. When the response is
 * an array (some endpoints return bare arrays, e.g. meal-types), each item is
 * slimmed directly.
 */
export function slimResponse<T, U>(value: unknown, slim: (item: T) => U): unknown {
  if (Array.isArray(value)) return (value as T[]).map(slim);
  return slimPaginated(value, slim);
}
