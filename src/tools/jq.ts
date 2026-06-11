// Registers the `jq_query` (and debug `jq_stash_stats`) tools. These are the
// LLM-facing side of the stash middleware: when a tool result is too big it
// gets parked and the LLM is handed a handle; the LLM calls jq_query with a
// jq filter to pull out exactly what it wants.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { handleJqQuery, handleJqStashStats } from '../handlers/jq.js';

// Handles are `stash_${randomUUID()}`. Pinning the regex stops the LLM
// from accidentally sending free-form text (which we'd then echo back),
// and keeps the validation error generic.
const HANDLE_RE = /^stash_[0-9a-f-]{36}$/;
// jq's parser itself can be slow on adversarial input — cap before it ever
// reaches the WASM. 4096 chars is far above any realistic real filter.
const FILTER_MAX = 4096;

export const jqQueryShape = {
  handle: z
    .string()
    .regex(HANDLE_RE, 'invalid stash handle')
    .describe('Stash handle from a prior tool result, e.g. "stash_<uuid>".'),
  filter: z
    .string()
    .min(1)
    .max(FILTER_MAX)
    .describe(
      'jq filter to apply to the stashed value. Examples: ".results | length", ".results[0]", ".results | map({id, name})", "keys", ".count".',
    ),
} as const;

export type JqQueryArgs = z.infer<z.ZodObject<typeof jqQueryShape>>;

export const jqStashStatsShape = {} as const;

export function registerJqTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'jq_query', {
    description: [
      'Run a jq filter against a previously stashed tool result and return the focused subset.',
      'Use this when a prior tool returned `{stashed:true, handle, shape, sample_filters}` instead of the full payload.',
      'Treat the stash like a JSON document the user already paid for — extract only what you need.',
      'Common filters: ".results | length", ".results[] | select(.id == 42)", ".results | map({id, name})", "keys", ".count".',
    ].join(' '),
    inputSchema: jqQueryShape,
  }, handleJqQuery);

  registerStringTool(server, client, 'jq_stash_stats', {
    description: 'Inspect the in-memory stash (count + total bytes). Diagnostic; not normally needed.',
    inputSchema: jqStashStatsShape,
  }, handleJqStashStats);
}
