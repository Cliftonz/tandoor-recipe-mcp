// Three places independently inline the Tandoor DRF pagination envelope.
// One shared factory keeps `{count, next, previous, results}` consistent and
// lets a future schema change (e.g. `total_pages`) touch one file.

export function paginated<T>(results: T[]): { count: number; next: null; previous: null; results: T[] } {
  return { count: results.length, next: null, previous: null, results };
}
