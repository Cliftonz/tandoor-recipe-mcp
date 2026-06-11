// Handler for the jq_query tool: looks up a stashed JSON payload by handle,
// runs a jq filter against it via worker-isolated WebAssembly jq, returns
// the result. If the result is still big, the register middleware re-stashes
// it — recursion is handled by the same code path that handled the original.
//
// Untrusted inputs: both `handle` and `filter` come from the MCP client.
// Tightening lives in src/tools/jq.ts (zod regex + length cap). Resource
// limits — timeout + output cap — live in src/lib/jq-runner.ts.

import { TandoorClient } from '../clients/index.js';
import type { HandlerContext } from '../lib/register.js';
import { getStashConfig, stashGet, stashStats } from '../lib/stash.js';
import { runJq } from '../lib/jq-runner.js';
import { emit } from '../lib/slim.js';
import type { JqQueryArgs } from '../tools/jq.js';

const LOG_MODES = (() => {
  const raw = (process.env.TANDOOR_MCP_LOG || '').toLowerCase();
  if (!raw) return new Set<string>();
  if (raw === 'all') return new Set(['request', 'response', 'error']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
})();

export async function handleJqQuery(
  _client: TandoorClient,
  args: JqQueryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const cfg = getStashConfig();
  const entry = stashGet(args.handle, cfg);
  if (!entry) {
    const { count } = stashStats();
    // Generic phrasing — do not echo args.handle back into prose the LLM
    // will read next turn (the handle is attacker-shaped if the client is
    // compromised / confused). The remedy stays actionable.
    throw new Error(
      `stash handle not found or expired (stash holds ${count} entries, ttl=${cfg.ttlMs}ms). Re-run the original tool to get a fresh handle.`,
    );
  }
  if (LOG_MODES.has('request')) {
    console.error(`[tandoor-mcp] jq ${args.handle} ${args.filter.slice(0, 120)}`);
  }
  let result;
  try {
    result = await runJq(entry.text, args.filter, ctx?.signal);
  } catch (err) {
    if (LOG_MODES.has('error')) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tandoor-mcp] jq ✗ ${msg}`);
    }
    throw err;
  }
  // jq writes warnings (e.g. from `debug`) to stderr while still exiting 0.
  // Treat exit code as the source of truth for success/failure; surface
  // stderr separately via the trace log instead of failing the call.
  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || `exit ${result.exitCode}`;
    if (LOG_MODES.has('error')) {
      console.error(`[tandoor-mcp] jq ✗ exit=${result.exitCode} ${msg.slice(0, 200)}`);
    }
    throw new Error(`jq: ${msg}`);
  }
  if (result.stderr.trim().length > 0 && LOG_MODES.has('error')) {
    console.error(`[tandoor-mcp] jq ⚠ ${result.stderr.trim().slice(0, 200)}`);
  }
  const out = result.stdout.trim();
  if (out.length === 0) return emit(null);
  // jq emits one JSON value per line. Single line → return as-is. Multiple
  // lines → wrap in an array so the result is a single valid JSON value.
  if (!out.includes('\n')) return out;
  const lines = out.split('\n').filter((l) => l.length > 0);
  if (lines.length === 1) return lines[0]!;
  return `[${lines.join(',')}]`;
}

export async function handleJqStashStats(
  _client: TandoorClient,
  _args: Record<string, never>,
  _ctx?: HandlerContext,
): Promise<string> {
  return emit(stashStats());
}
