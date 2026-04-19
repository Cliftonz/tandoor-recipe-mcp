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
// 3. **Uniform try/catch** — any thrown error becomes `{isError: true}` with
//    a readable message, instead of crashing the transport.

import { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodRawShape, z } from 'zod';
import { TandoorClient } from '../clients/index.js';

/** Turn a Zod raw shape into the inferred args object. */
export type InferShape<S extends ZodRawShape> = z.infer<z.ZodObject<S>>;

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

export type StringHandler<S extends ZodRawShape> = (
  client: TandoorClient,
  args: InferShape<S>
) => Promise<string>;

/**
 * Try to detect a JSON payload embedded in the handler's string output so it
 * can be mirrored as `structuredContent`. Handlers generally return one of:
 *   - pure JSON: `{"id":1,...}`
 *   - "Header message.\n\n{JSON}" style confirmations
 *   - plain human text ("Meal plan 5 deleted.") — no structured mirror
 */
function tryExtractStructured(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  }
  const splitIdx = text.search(/\n\n[\[{]/);
  if (splitIdx !== -1) {
    const payload = text.slice(splitIdx + 2);
    try { return JSON.parse(payload); } catch { /* fallthrough */ }
  }
  return undefined;
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
  const cb = async (args: InferShape<S>, _extra: unknown): Promise<CallToolResult> => {
    try {
      const text = await handler(client, args);
      const structured = tryExtractStructured(text);
      // Build the result in one shot so `structuredContent` keeps its spec
      // typing (Record<string, unknown>) without an intermediate cast.
      const result: CallToolResult = structured !== undefined && typeof structured === 'object' && structured !== null
        ? {
            content: [{ type: 'text', text }],
            structuredContent: structured as Record<string, unknown>,
          }
        : { content: [{ type: 'text', text }] };
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
