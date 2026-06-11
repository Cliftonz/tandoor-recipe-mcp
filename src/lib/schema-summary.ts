// Depth-limited shape sketch of a JSON value. Returned to the LLM in place
// of a stashed payload so it knows what's in there well enough to write a
// useful jq filter without seeing the whole thing.

export interface SchemaSummary {
  stashed: true;
  handle: string;
  size_bytes: number;
  shape: unknown;
  hint: string;
  sample_filters: string[];
}

const MAX_DEPTH = 3;
const MAX_KEYS = 20;
const MAX_STRING = 80;
const ARRAY_KEY_UNION_SAMPLE = 5;

function truncateString(s: string): string {
  return s.length <= MAX_STRING ? s : `${s.slice(0, MAX_STRING)}…`;
}

// Use null-prototype maps for any record keyed by untrusted upstream JSON
// keys. Without this, a payload containing `"__proto__": {...}` rewrites the
// prototype of the keys object (silently corrupts JSON.stringify output and
// data-controls the prototype chain) instead of adding an own property.
function emptyKeyMap(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function sketch(value: unknown, depth: number): unknown {
  if (value === null) return { type: 'null' };
  if (depth > MAX_DEPTH) return { type: typeof value, truncated: true };

  if (Array.isArray(value)) {
    const out: Record<string, unknown> = { type: 'array', length: value.length };
    if (value.length === 0) return out;
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      // Union keys across the first few items so optional fields surface.
      const keyTypes = new Map<string, Set<string>>();
      for (const item of value.slice(0, ARRAY_KEY_UNION_SAMPLE)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          if (!keyTypes.has(k)) keyTypes.set(k, new Set());
          keyTypes.get(k)!.add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
        }
      }
      const keys = emptyKeyMap();
      let count = 0;
      for (const [k, types] of keyTypes) {
        if (count >= MAX_KEYS) break;
        keys[k] = { type: types.size === 1 ? [...types][0] : [...types] };
        count++;
      }
      const item: Record<string, unknown> = { type: 'object', keys };
      // _truncated lives on the wrapper, not inside keys — so a real
      // upstream key literally named "_truncated" cannot collide.
      if (keyTypes.size > MAX_KEYS) item._truncated = keyTypes.size - MAX_KEYS;
      out.item = item;
    } else {
      out.item = sketch(first, depth + 1);
    }
    return out;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const keys = emptyKeyMap();
    const limit = Math.min(entries.length, MAX_KEYS);
    for (let i = 0; i < limit; i++) {
      const [k, v] = entries[i]!;
      keys[k] = sketch(v, depth + 1);
    }
    const out: Record<string, unknown> = { type: 'object', keys };
    if (entries.length > MAX_KEYS) out._truncated = entries.length - MAX_KEYS;
    return out;
  }

  if (typeof value === 'string') return { type: 'string', sample: truncateString(value) };
  if (typeof value === 'number') return { type: 'number', sample: value };
  if (typeof value === 'boolean') return { type: 'boolean', sample: value };
  return { type: typeof value };
}

function isTandoorPaginated(v: unknown): v is { count: number; results: unknown[] } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.results) && 'count' in o && 'next' in o && 'previous' in o;
}

export function summarize(value: unknown, handle: string, size: number): SchemaSummary {
  const shape = sketch(value, 0);
  const sample_filters: string[] = [];
  let hint: string;

  if (isTandoorPaginated(value)) {
    sample_filters.push('.count', '.results | length', '.results[0]', '.results | map({id, name})');
    hint = `Tandoor paginated payload. Call jq_query with handle="${handle}" and a filter like ".results | map({id, name})" to extract what you need.`;
  } else if (Array.isArray(value)) {
    sample_filters.push('length', '.[0]', 'map({id, name})');
    hint = `Array of ${value.length} items. Call jq_query with handle="${handle}" and a filter like ".[0]" or "map({id, name})".`;
  } else if (value && typeof value === 'object') {
    sample_filters.push('keys', '. | {id, name}');
    hint = `Object payload. Call jq_query with handle="${handle}" and a filter like "keys" or ". | {id, name}".`;
  } else {
    sample_filters.push('.');
    hint = `Scalar payload. Call jq_query with handle="${handle}" and filter "." to retrieve.`;
  }

  return { stashed: true, handle, size_bytes: size, shape, hint, sample_filters };
}
