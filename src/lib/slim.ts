// Shared helpers used across every handler file. Before this module existed,
// each handler rolled its own `slimPage` / nested-id-envelope / JSON emit
// inline — 150+ lines of subtly-different copies. Centralising them keeps
// response shapes consistent and makes format tweaks one-file changes.

/**
 * JSON-serialize compactly. Pretty-printing costs ~40% more tokens on the
 * MCP wire and MCP clients re-format for display anyway.
 */
export const emit = (o: unknown): string => JSON.stringify(o);

/**
 * Tandoor's MealPlan/Ingredient/ShoppingListEntry serializers all expect FK
 * writes in a nested `{id: n}` envelope rather than a bare integer. Use this
 * helper instead of inlining the object literal to make the intent explicit
 * and keep a single call-site per "nested ref" concept.
 */
export function refId(id: number): { id: number };
export function refId(id: number | null | undefined): { id: number } | null;
export function refId(id: number | null | undefined): { id: number } | null {
  return id == null ? null : { id };
}

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
