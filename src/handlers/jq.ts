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

// Lazy: re-read TANDOOR_MCP_LOG on each call so a long-running stdio server
// honors verbosity changes without restart. Cheap — one env read + one tiny
// Set per call (Observability F14).
let _lastObservedLogRaw: string | undefined;
function getLogModes(): Set<string> {
  const raw = (process.env.TANDOOR_MCP_LOG || '').toLowerCase();
  // Emit a one-line confirmation on transition so an operator who flipped
  // the env can see their change took effect (Observability F5).
  if (_lastObservedLogRaw !== undefined && _lastObservedLogRaw !== raw) {
    console.error(`[tandoor-mcp] log modes changed: '${_lastObservedLogRaw}' → '${raw}'`);
  }
  _lastObservedLogRaw = raw;
  if (!raw) return new Set<string>();
  if (raw === 'all') return new Set(['request', 'response', 'error']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

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
  // Correlation token from the register middleware. Pairs with the
  // `stashed '...' → <handle> (req=...)` line so on-call can walk back from
  // a jq failure to the original list call.
  const reqTag = ctx?.reqId ? ` (req=${ctx.reqId})` : '';
  // Unconditional one-line entry log so a hang inside runJq is visible
  // even without TANDOOR_MCP_LOG=request set. Logs filter length (not
  // content) to keep PII out of stderr.
  console.error(`[tandoor-mcp] jq_query handle=${args.handle} filter_len=${args.filter.length}${reqTag}`);
  const logModes = getLogModes();
  if (logModes.has('request')) {
    console.error(`[tandoor-mcp] jq ${args.handle} ${args.filter.slice(0, 120)}${reqTag}`);
  }
  let result;
  try {
    result = await runJq(entry.text, args.filter, ctx?.signal);
  } catch (err) {
    if (logModes.has('error')) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tandoor-mcp] jq ✗ ${msg}${reqTag}`);
    }
    throw err;
  }
  // jq writes warnings (e.g. from `debug`) to stderr while still exiting 0.
  // Treat exit code as the source of truth for success/failure; surface
  // stderr separately via the trace log instead of failing the call.
  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || `exit ${result.exitCode}`;
    if (logModes.has('error')) {
      console.error(`[tandoor-mcp] jq ✗ exit=${result.exitCode} ${msg.slice(0, 200)}${reqTag}`);
    }
    throw new Error(`jq: ${msg}`);
  }
  if (result.stderr.trim().length > 0 && logModes.has('error')) {
    console.error(`[tandoor-mcp] jq ⚠ ${result.stderr.trim().slice(0, 200)}${reqTag}`);
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

import { getGuardRejectionStats } from '../lib/register.js';

export async function handleGuardStats(
  _client: TandoorClient,
  _args: Record<string, never>,
  _ctx?: HandlerContext,
): Promise<string> {
  return emit(getGuardRejectionStats());
}
