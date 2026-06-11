// Bounded LRU + TTL cache that lets the register-tool middleware park large
// JSON results out of the LLM's conversation window. The LLM gets a handle
// + schema summary; if it wants the underlying data it calls the `jq_query`
// tool with the handle and a jq filter. Config comes from env so users opt
// in without code changes.
//
// Entries store the raw JSON *text* the handler produced, not the parsed
// object. jq-wasm accepts a string input verbatim, so the handler can pass
// `entry.text` straight through — no per-call re-serialization, and the
// retained RAM is the JSON byte count (predictable) instead of a V8 object
// graph (2–5× larger and unpredictable).

import { randomUUID } from 'node:crypto';

export interface StashConfig {
  enabled: boolean;
  thresholdBytes: number;
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
}

export interface StashEntry {
  id: string;
  text: string;
  size: number;
  createdAt: number;
}

const DEFAULTS = {
  thresholdBytes: 25_000,
  maxEntries: 32,
  maxBytes: 32_000_000,
  ttlMs: 600_000,
};

// One-shot stderr warnings for bad env values. We don't want a noisy
// per-tool-call log when an operator typos a number — one line per process
// is enough to surface the misconfiguration without flooding.
const _warnedEnv = new Set<string>();
function warnEnvOnce(name: string, value: string, fallback: string | number): void {
  if (_warnedEnv.has(name)) return;
  _warnedEnv.add(name);
  console.error(`[tandoor-mcp] WARNING: ignoring invalid ${name}=${JSON.stringify(value)}, using ${fallback}`);
}

// Test-only: reset the warned-env set so each test starts clean.
export function _resetEnvWarnings(): void {
  _warnedEnv.clear();
}

// Treats unset as "on" so the feature ships default-on. Explicit falsy
// strings (0/false/no/off) still opt out for operators who want the old
// behavior. Anything else with a value defaults to true but warns once.
const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled', 'enable']);
const FALSY = new Set(['0', 'false', 'no', 'off', 'disabled', 'disable']);
function parseBoolDefaultTrue(name: string, v: string | undefined): boolean {
  if (v === undefined) return true;
  const s = v.toLowerCase().trim();
  if (s === '') return true;
  if (FALSY.has(s)) return false;
  if (TRUTHY.has(s)) return true;
  warnEnvOnce(name, v, 'true');
  return true;
}

function parseIntEnv(name: string, v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isFinite(n) && n > 0 && String(n) === v.trim()) return n;
  warnEnvOnce(name, v, fallback);
  return fallback;
}

// Evaluated lazily so tests can mutate process.env between cases. Real
// callers (register middleware, handler) take cfg as a param so we don't
// re-read env three times per tool call.
export function getStashConfig(): StashConfig {
  return {
    enabled: parseBoolDefaultTrue('TANDOOR_MCP_STASH_ENABLED', process.env.TANDOOR_MCP_STASH_ENABLED),
    thresholdBytes: parseIntEnv('TANDOOR_MCP_STASH_THRESHOLD', process.env.TANDOOR_MCP_STASH_THRESHOLD, DEFAULTS.thresholdBytes),
    maxEntries: parseIntEnv('TANDOOR_MCP_STASH_MAX_ENTRIES', process.env.TANDOOR_MCP_STASH_MAX_ENTRIES, DEFAULTS.maxEntries),
    maxBytes: parseIntEnv('TANDOOR_MCP_STASH_MAX_BYTES', process.env.TANDOOR_MCP_STASH_MAX_BYTES, DEFAULTS.maxBytes),
    ttlMs: parseIntEnv('TANDOOR_MCP_STASH_TTL_MS', process.env.TANDOOR_MCP_STASH_TTL_MS, DEFAULTS.ttlMs),
  };
}

// Insertion order = LRU order. Map preserves it on `set` (new key) and on
// `delete` + `set` (touch). We touch on get to refresh recency. `totalBytes`
// tracks the running sum so we don't walk the map on every put just to
// compare against maxBytes.
const store = new Map<string, StashEntry>();
let totalBytes = 0;

function deleteEntry(id: string): boolean {
  const e = store.get(id);
  if (!e) return false;
  totalBytes -= e.size;
  store.delete(id);
  return true;
}

function sweepExpired(cfg: StashConfig): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > cfg.ttlMs) deleteEntry(k);
  }
}

// Drop oldest entries until both caps are satisfied. `protectId` (set during
// stashPut) keeps the just-inserted entry alive even if it is itself over
// the byte cap — see stashPut's reject-oversized check for that case.
function enforceCaps(cfg: StashConfig, protectId?: string): void {
  while (store.size > cfg.maxEntries || totalBytes > cfg.maxBytes) {
    const first = store.keys().next().value;
    if (first === undefined || first === protectId) break;
    deleteEntry(first);
  }
}

export function stashPut(text: string, cfg: StashConfig): StashEntry {
  const size = Buffer.byteLength(text, 'utf8');
  // A single entry larger than maxBytes can never fit. Reject up front so
  // the caller can pass the raw text through instead of stashing a value
  // that would immediately get evicted on the next put.
  if (size > cfg.maxBytes) {
    throw new Error(`stash entry size ${size}B exceeds maxBytes ${cfg.maxBytes}B`);
  }
  sweepExpired(cfg);
  const entry: StashEntry = {
    id: `stash_${randomUUID()}`,
    text,
    size,
    createdAt: Date.now(),
  };
  store.set(entry.id, entry);
  totalBytes += size;
  enforceCaps(cfg, entry.id);
  return entry;
}

export function stashGet(id: string, cfg: StashConfig): StashEntry | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > cfg.ttlMs) {
    deleteEntry(id);
    return undefined;
  }
  // Touch: move to end of insertion order.
  store.delete(id);
  store.set(id, entry);
  return entry;
}

export function stashStats(): { count: number; bytes: number } {
  return { count: store.size, bytes: totalBytes };
}

// Test-only: drop every entry. Not exported through the index; tests import directly.
export function _stashClear(): void {
  store.clear();
  totalBytes = 0;
}

// Single source of truth for "should this result be stashed". Used by the
// register middleware; the structured-object guard is part of the rule
// because the LLM needs a JSON document jq can operate on, and the size
// is computed once by the caller and threaded in.
export function shouldStash(structured: unknown, sizeBytes: number, cfg: StashConfig): boolean {
  if (!cfg.enabled) return false;
  if (structured === null || typeof structured !== 'object') return false;
  return sizeBytes > cfg.thresholdBytes;
}
