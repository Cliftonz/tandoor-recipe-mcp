import type { TandoorClient } from '../clients/index.js';

export const MIN_SUPPORTED_MAJOR = 2;

// Server-reported version strings are untrusted input that ends up in the MCP
// instructions channel and stderr. Only strings matching this allowlist are
// ever echoed; everything else is replaced with a static message.
const VERSION_SHAPE = /^[0-9][\w.+-]{0,31}$/;

const UNSUPPORTED_ADVICE =
  `This server targets the Tandoor ${MIN_SUPPORTED_MAJOR}.x API; write operations ` +
  '(recipes, meal plans, shopping entries) will likely fail. Upgrade Tandoor to ' +
  `${MIN_SUPPORTED_MAJOR}.x or use an older release of this MCP server.`;

export interface VersionCheckResult {
  status: 'ok' | 'unsupported' | 'unknown';
  /** stderr log level for non-ok results: 'warning' demands operator action. */
  level: 'warning' | 'note';
  version?: string;
  detail: string;
}

export function evaluateVersion(version: unknown): VersionCheckResult {
  if (typeof version !== 'string' || version.trim() === '') {
    return {
      status: 'unknown',
      level: 'note',
      detail: 'Tandoor did not report a version; compatibility cannot be verified.',
    };
  }
  const trimmed = version.trim();
  if (!VERSION_SHAPE.test(trimmed)) {
    // Never echo a string that fails the allowlist — it is server-controlled
    // and would otherwise flow into the MCP instructions and stderr logs.
    return {
      status: 'unknown',
      level: 'note',
      detail: 'Tandoor reported a malformed version string; compatibility cannot be verified.',
    };
  }
  const major = /^(\d+)(?:\.|$)/.exec(trimmed);
  if (!major) {
    return {
      status: 'unknown',
      level: 'note',
      version: trimmed,
      detail: `Tandoor reported an unparseable version "${trimmed}"; compatibility cannot be verified.`,
    };
  }
  if (Number(major[1]) < MIN_SUPPORTED_MAJOR) {
    return {
      status: 'unsupported',
      level: 'warning',
      version: trimmed,
      detail: `Connected Tandoor is version ${trimmed}. ${UNSUPPORTED_ADVICE}`,
    };
  }
  return { status: 'ok', level: 'note', version: trimmed, detail: `Tandoor ${trimmed} detected.` };
}

// Error messages from base.ts embed multi-line response-body excerpts; flatten
// and cap so they fit a single `[tandoor-mcp]`-prefixed stderr line.
function flatten(msg: string): string {
  return msg.replace(/\s*\n+\s*/g, ' ').slice(0, 300);
}

/**
 * Probes /api/server-settings/current/ to verify the connected Tandoor speaks
 * the 2.x API. The endpoint only exists on 2.x, so a 404 is treated as a
 * pre-2.x instance. Network failures and timeouts are inconclusive — the
 * server still starts, status is just 'unknown'.
 */
export async function checkTandoorVersion(
  client: TandoorClient,
  timeoutMs = 3000,
): Promise<VersionCheckResult> {
  // A boot-time best-effort probe should never retry, and the timeout must
  // actually cancel the request (not just abandon it to base.ts's retry loop).
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const settings = await client.serverSettings.getCurrent({ signal, maxRetries: 0 });
    return evaluateVersion(settings?.version);
  } catch (err) {
    if (signal.aborted) {
      return {
        status: 'unknown',
        level: 'note',
        detail: `Could not verify Tandoor version (probe timed out after ${timeoutMs}ms). Continuing anyway.`,
      };
    }
    const msg = flatten(err instanceof Error ? err.message : String(err));
    if (/^Tandoor API error: 404\b/.test(msg)) {
      return {
        status: 'unsupported',
        level: 'warning',
        detail:
          `GET ${client.getBaseUrl()}/api/server-settings/current/ returned 404 — this ` +
          'endpoint exists only on Tandoor 2.x+, so the instance is likely 1.x, or ' +
          'TANDOOR_URL points at the wrong root (any path in TANDOOR_URL is stripped ' +
          `to the origin). ${UNSUPPORTED_ADVICE}`,
      };
    }
    if (/^Tandoor API error: 40[13]\b/.test(msg)) {
      return {
        status: 'unknown',
        level: 'warning',
        detail:
          `Tandoor rejected the version probe (${msg}) — the token is likely invalid ` +
          'and ALL tool calls will fail. Check TANDOOR_TOKEN.',
      };
    }
    return {
      status: 'unknown',
      level: 'note',
      detail: `Could not verify Tandoor version (${msg}). Continuing anyway.`,
    };
  }
}
