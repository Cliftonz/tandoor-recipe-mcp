// Shared test helper for invoking a registered tool the way `callTool`
// would, without spinning up a stdio transport. Reaches into McpServer's
// private registry — confining that to one file means the next SDK rename
// is a one-line fix, not a four-file grep.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toJSONSchema } from 'zod';

export async function invokeTool(
  server: McpServer,
  name: string,
  args: unknown,
): Promise<any> {
  const registered = (server as any)._registeredTools?.[name];
  if (!registered) throw new Error(`tool ${name} not registered`);
  return registered.handler(args, { signal: new AbortController().signal });
}

export interface RegisteredToolInfo {
  name: string;
  description: string;
  /**
   * JSON Schema serialization of the tool's Zod input schema. Locked by
   * the description snapshot so a refactor that drops a field, renames a
   * param, or relaxes a type shows up as a reviewable diff (QA F9).
   * `null` when the SDK serializer can't produce one (no inputSchema, or
   * an SDK shape we don't recognize) — bias toward "snapshot null" over
   * a noisy partial.
   */
  inputSchema: unknown;
}

function safeSerializeSchema(raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  // The SDK stores a Zod object instance on `_registeredTools[name].inputSchema`.
  // zod 4's `toJSONSchema` produces a stable, snapshotable representation.
  try {
    return toJSONSchema(raw as any);
  } catch {
    return null;
  }
}

/**
 * Read every tool registered on the server. Keeps SDK-private field access in
 * this one file so the next rename of `_registeredTools` is a one-line fix.
 */
export function listRegisteredTools(server: McpServer): RegisteredToolInfo[] {
  const reg = (server as any)._registeredTools as Record<string, { description?: string; inputSchema?: unknown }> | undefined;
  if (!reg) return [];
  return Object.entries(reg)
    .map(([name, def]) => ({
      name,
      description: def.description ?? '',
      inputSchema: safeSerializeSchema(def.inputSchema),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Just the registered tool names, sorted. Useful for "this set must include X". */
export function registeredToolNames(server: McpServer): string[] {
  return listRegisteredTools(server).map((t) => t.name);
}

/**
 * Direct access to the internal registered-tool record. The shape is
 * `{ handler: (args, extra) => CallToolResult, description, inputSchema, ... }`
 * but callers should treat the return as opaque and just call `.handler`.
 * This (plus `invokeTool` above) is the only file in the repo that pokes the
 * SDK-private `_registeredTools` map — same rationale as the file header.
 */
export function getRegisteredTool(server: McpServer, name: string): { handler: (args: unknown, extra: { signal: AbortSignal }) => Promise<any> } {
  const reg = (server as any)._registeredTools as Record<string, any> | undefined;
  const entry = reg?.[name];
  if (!entry) throw new Error(`tool ${name} not registered`);
  return entry;
}
