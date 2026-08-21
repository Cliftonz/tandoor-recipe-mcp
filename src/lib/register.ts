// Adapter: wraps a (client, args) => Promise<string> handler into the shape
// McpServer.registerTool expects. Provides:
//
// 1. **Typed args at the handler boundary** via `InferShape<S>` — when a
//    caller supplies a Zod input schema `S`, the handler's `args` are typed
//    as the inferred shape rather than `any`.
// 2. **structuredContent** — if the handler's returned string looks like JSON
//    (optionally prefixed by a `header\n\n` preamble), the parsed object is
//    attached as `structuredContent` per the MCP spec. This lets modern MCP
//    clients consume the typed payload without re-parsing the text field.
// 3. **Stash gate** — large JSON payloads are parked in a bounded in-memory
//    cache and replaced with a schema summary + handle, so the LLM doesn't
//    blow its context on a 200KB recipe list it only wanted to count.
// 4. **Uniform try/catch** — any thrown error becomes `{isError: true}` with
//    a readable message, instead of crashing the transport.

import { randomUUID } from 'node:crypto';
import { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodRawShape, z } from 'zod';
import { TandoorClient } from '../clients/index.js';
import { getStashConfig, shouldStash as baseShouldStash, stashPut, type StashConfig } from './stash.js';
import { summarize } from './schema-summary.js';

// HTTP transport shares process state across concurrent MCP clients; the
// stash handle namespace would leak between them. When TANDOOR_MCP_TRANSPORT
// is `http`, bypass stashing unconditionally so each response is delivered
// inline to its originating request.
function transportBypassesStash(): boolean {
  return (process.env.TANDOOR_MCP_TRANSPORT || '').toLowerCase() === 'http';
}

export function shouldStash(structured: unknown, sizeBytes: number, cfg: StashConfig): boolean {
  if (transportBypassesStash()) return false;
  return baseShouldStash(structured, sizeBytes, cfg);
}

/** Turn a Zod raw shape into the inferred args object. */
export type InferShape<S extends ZodRawShape> = z.infer<z.ZodObject<S>>;

/**
 * Context passed to every handler. Carries the MCP request's AbortSignal so
 * long-running handlers (URL import, AI import, file upload) can cooperate
 * with client-side cancellation. Short handlers can ignore it.
 *
 * `reqId` is a short correlation token generated at the register-middleware
 * boundary. Stash/jq logs include it so an operator can pair
 * "list_recipes minted handle X" with "jq_query on handle X failed" in the
 * same log scrape — under concurrent traffic the handle id alone is not
 * enough to walk back to the originating call.
 *
 * Both fields are optional because direct-handler-invocation tests (and any
 * non-MCP callers) construct `ctx` without going through the wrapper. The
 * wrapper at registerStringTool always populates them; handlers should read
 * via `ctx?.signal` / `ctx?.reqId` to stay tolerant.
 */
export interface HandlerContext {
  signal?: AbortSignal;
  reqId?: string;
}

// ---------- Per-tool allow/deny filters ----------
// Two env vars let callers trim the exposed tool surface without touching
// code. Both accept a comma-separated list of exact names or glob patterns
// (only `*` is supported as a wildcard). Filters compose: INCLUDE_ONLY runs
// first, then EXCLUDE. If a tool is filtered out, registerStringTool is a
// no-op for it.
//
//   TANDOOR_MCP_INCLUDE_ONLY="list_*,get_*,create_meal_plan"
//   TANDOOR_MCP_EXCLUDE="merge_*,delete_*,*_admin"

export function parseFilterList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Pure filter logic so tests can exercise it without touching process.env. */
export function checkToolAllowed(
  name: string,
  includeOnly: RegExp[],
  exclude: RegExp[]
): boolean {
  if (includeOnly.length > 0 && !includeOnly.some((re) => re.test(name))) return false;
  if (exclude.some((re) => re.test(name))) return false;
  return true;
}

// Evaluated once at module load.
const INCLUDE_ONLY = parseFilterList(process.env.TANDOOR_MCP_INCLUDE_ONLY).map(globToRegex);
const EXCLUDE = parseFilterList(process.env.TANDOOR_MCP_EXCLUDE).map(globToRegex);

export function isToolAllowed(name: string): boolean {
  return checkToolAllowed(name, INCLUDE_ONLY, EXCLUDE);
}

// Track skips once per process so the operator can see what got filtered.
const _loggedSkips = new Set<string>();
function logSkip(name: string): void {
  if (_loggedSkips.has(name)) return;
  _loggedSkips.add(name);
  // stderr so it never pollutes stdout (which belongs to the MCP transport).
  console.error(`[tandoor-mcp] skipping tool '${name}' — filtered by TANDOOR_MCP_INCLUDE_ONLY/EXCLUDE`);
}

// Names that actually passed registration. The stash gate only kicks in
// when `jq_query` is in here — otherwise a stashed payload becomes
// unreachable (no tool to resolve the handle), so we'd be silently dropping
// data on the floor for operators who filtered jq_query out.
const _registeredNames = new Set<string>();

/** Test-only: reset the recorded registration set between test cases. */
export function _resetRegisteredNames(): void {
  _registeredNames.clear();
}

export type StringHandler<S extends ZodRawShape> = (
  client: TandoorClient,
  args: InferShape<S>,
  ctx?: HandlerContext
) => Promise<string>;

interface ExtractedJson {
  structured: unknown;
  payloadText: string;
  header?: string;
}

/**
 * Try to detect a JSON payload embedded in the handler's string output so it
 * can be mirrored as `structuredContent`. Handlers generally return one of:
 *   - pure JSON: `{"id":1,...}`
 *   - "Header message.\n\n{JSON}" style confirmations
 *   - plain human text ("Meal plan 5 deleted.") — no structured mirror
 *
 * Returns the parsed value, the substring that was the JSON payload (which
 * the stash gate stores verbatim — jq-wasm takes it as a string and avoids
 * a round-trip stringify), and any header prefix so the gate can preserve
 * mutating-tool confirmation text instead of dropping it.
 */
function tryExtractStructured(text: string): ExtractedJson | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { structured: JSON.parse(trimmed), payloadText: trimmed };
    } catch { /* fallthrough */ }
  }
  const splitIdx = text.search(/\n\n[\[{]/);
  if (splitIdx !== -1) {
    const header = text.slice(0, splitIdx);
    const payload = text.slice(splitIdx + 2);
    try {
      return { structured: JSON.parse(payload), payloadText: payload, header };
    } catch { /* fallthrough */ }
  }
  return undefined;
}

function isStructuredObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

// MCP requires `structuredContent` to be a JSON object — strict clients (e.g.
// the SDK Client) reject arrays here with `expected: "record"`. The stash
// gate's predicate is intentionally broader (top-level arrays are still
// worth stashing); this one guards only the pass-through mirror.
function isJsonObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// One-shot dedup so the array-skip log fires exactly once per tool name per
// process. Mirrors the `_loggedSkips` pattern at the top of this file — the
// operator wants to know a downgrade is happening, not to be flooded.
const _loggedArraySkips = new Set<string>();

// Per-process counters for security-guard rejections. Exposed via the
// `get_guard_stats` tool so an operator can dashboard "guard rejections per
// hour" without grep'ing server stderr. Bounded cardinality (two counters).
const _guardRejections: Record<string, number> = {
  PathGuardError: 0,
  SsrfBlockedError: 0,
};
export function recordGuardRejection(name: string): void {
  _guardRejections[name] = (_guardRejections[name] ?? 0) + 1;
}
export function getGuardRejectionStats(): Record<string, number> {
  return { ..._guardRejections };
}
/** Test-only: reset counters so each test starts clean. */
export function _resetGuardRejectionStats(): void {
  for (const k of Object.keys(_guardRejections)) _guardRejections[k] = 0;
}

/** Test-only: reset so each test starts clean. */
export function _resetArraySkipLog(): void {
  _loggedArraySkips.clear();
}

// Module-level: reused instead of allocating an AbortController per no-signal call.
const NEVER_ABORTED: AbortSignal = new AbortController().signal;

function shortReqId(): string {
  // 8 chars of base16 from randomUUID — enough cardinality for grep
  // correlation under any realistic concurrent-call volume; short enough
  // that the log line stays readable.
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export function registerStringTool<S extends ZodRawShape>(
  server: McpServer,
  client: TandoorClient,
  name: string,
  config: { description: string; inputSchema?: S; title?: string },
  handler: StringHandler<S>
): void {
  if (!isToolAllowed(name)) {
    logSkip(name);
    return;
  }
  _registeredNames.add(name);
  const cb = async (args: InferShape<S>, extra: { signal?: AbortSignal; requestId?: string | number }): Promise<CallToolResult> => {
    const signal = extra?.signal ?? NEVER_ABORTED;
    // Prefer the SDK's request id (varies by transport — usually a number)
    // and fall back to a server-side short uuid so the field is always
    // present in logs even for harnesses that don't set one.
    const reqId = extra?.requestId !== undefined ? String(extra.requestId) : shortReqId();
    try {
      const text = await handler(client, args, { signal, reqId });
      const extracted = tryExtractStructured(text);
      const stashCfg = getStashConfig();

      // Stash gate: if the payload is structured (parseable JSON) and big,
      // park the JSON text in the in-memory cache and return only a schema
      // summary + handle. The LLM then calls `jq_query` to extract what it
      // needs.
      //
      // Bypass when `jq_query` was filtered out at registration time — a
      // handle is useless without the tool that resolves it (Codex finding).
      if (
        extracted &&
        isStructuredObject(extracted.structured) &&
        _registeredNames.has('jq_query')
      ) {
        const payloadSize = Buffer.byteLength(extracted.payloadText, 'utf8');
        if (shouldStash(extracted.structured, payloadSize, stashCfg)) {
          try {
            const entry = stashPut(extracted.payloadText, stashCfg);
            const summary = summarize(extracted.structured, entry.id, payloadSize);
            // Preserve any "Header.\n\n{json}" preamble so mutating-tool
            // confirmations don't silently drop the created-entity ID.
            const summaryJson = JSON.stringify(summary);
            const textOut = extracted.header ? `${extracted.header}\n\n${summaryJson}` : summaryJson;
            console.error(`[tandoor-mcp] stashed '${name}' result: ${payloadSize}B > threshold=${stashCfg.thresholdBytes}B (TANDOOR_MCP_STASH_THRESHOLD) → ${entry.id} (req=${reqId})`);
            return {
              content: [{ type: 'text', text: textOut }],
              structuredContent: summary as unknown as Record<string, unknown>,
            };
          } catch (stashErr) {
            // Stash refused (e.g. payload larger than maxBytes). Fall
            // through to the unstashed return path so the caller still gets
            // their data; log so the operator can see the cap was hit.
            const msg = stashErr instanceof Error ? stashErr.message : String(stashErr);
            // The thrown error already names which cap fired (stash.ts:127
            // says "exceeds maxBytes N"); echo it verbatim instead of
            // hard-coding the env var here so a future cap that throws
            // through this catch doesn't misdirect the operator.
            console.error(`[tandoor-mcp] stash bypassed for '${name}': ${msg} (req=${reqId})`);
          }
        }
      }

      // Build the result in one shot so `structuredContent` keeps its spec
      // typing (Record<string, unknown>) without an intermediate cast. Arrays
      // (e.g. from a jq filter like `.results | map(.id)`) get the text
      // channel only — see isJsonObject for why. Log once per tool so an
      // operator can see post-deploy which endpoints exercise the downgrade
      // path (Observability F2).
      if (extracted && Array.isArray(extracted.structured) && !_loggedArraySkips.has(name)) {
        _loggedArraySkips.add(name);
        console.error(`[tandoor-mcp] structuredContent downgraded for '${name}': top-level array (req=${reqId})`);
      }
      const result: CallToolResult = extracted && isJsonObject(extracted.structured)
        ? {
            content: [{ type: 'text', text }],
            structuredContent: extracted.structured,
          }
        : { content: [{ type: 'text', text }] };
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Distinguish security-guard rejections so an operator can grep
      // server stderr for `guard rejection` to see probing / misconfig
      // signals — previously these were silent server-side and only
      // visible to the LLM client. Counters expose for dashboarding via
      // the `get_guard_stats` tool registered alongside jq_stash_stats.
      const guardName = (err as any)?.name;
      if (guardName === 'PathGuardError' || guardName === 'SsrfBlockedError') {
        recordGuardRejection(guardName);
        console.error(
          `[tandoor-mcp] guard rejection ${guardName} tool=${name} req=${reqId} msg=${message}`,
        );
      }
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
  // The SDK's `ToolCallback<S>` is structurally what we've built above — same
  // `(args, extra) => CallToolResult` shape when S extends ZodRawShapeCompat.
  // TypeScript can't match `z.infer<z.ZodObject<S>>` to the SDK's internal
  // `ShapeOutput<S>` across the helper boundary, so we narrow via the SDK's
  // own exported callback type. Still a cast, but typed — not `any`.
  server.registerTool(name, config, cb as unknown as ToolCallback<S>);
}
