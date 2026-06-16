// Defends file-upload handlers against a prompt-injected LLM coercing them
// into reading sensitive paths (~/.ssh/id_rsa, /etc/shadow, $HOME/.aws/credentials)
// and exfiltrating them as "recipe images" to a hostile Tandoor instance.
//
// Threat model: stdio MCP runs as the user's process; the LLM has whatever
// the user can read. A compromised or attacker-controlled Tandoor returns
// hostile text instructing the LLM to call upload_recipe_image with a
// file_path pointing at a secret. The data flows out as recipe-image bytes.
//
// Defense layers:
//   1. **Allow-list with realpath** — every file_path argument is checked
//      against a configured set of roots. Symlinks are resolved to their
//      real path before comparison so a symlink pointing outside the
//      allow-list cannot smuggle access.
//   2. **TOCTOU-resistant open** — handlers use `openSafeUpload` which
//      opens with O_NOFOLLOW (where available) and re-stats the file
//      descriptor against the inode + device captured during validation.
//      An attacker who swaps the file for a symlink between validate and
//      read is detected.
//
// Configuration:
//   TANDOOR_MCP_UPLOAD_ROOT — colon-separated list (POSIX) / semicolon
//     (Windows) of allowed root paths. `~` and `$HOME` expand to homedir.
//     - UNSET → defaults to ~/Downloads, ~/Pictures, ~/Documents, os.tmpdir().
//     - SET to empty/whitespace → explicit deny-all (every upload rejected).
//     - SET with typo'd or unmounted roots → those are silently skipped
//       from the effective allow-list, BUT a startup warning is logged to
//       stderr and the rejection message names them as "unreachable" so
//       the operator can fix the env without source-diving.

import { realpath, lstat, open as fsOpen, type FileHandle } from 'node:fs/promises';
import { constants as fsConstants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { tmpdir, homedir } from 'node:os';

const DELIM = process.platform === 'win32' ? ';' : ':';
const HOME_REF = /\$HOME\b/g;

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  return p.replace(HOME_REF, homedir());
}

/**
 * Parse the configured root list (the user-supplied form). Distinguishes
 * unset (defaults) from set-but-empty (deny-all). Pure — no fs access.
 */
export function getAllowedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.TANDOOR_MCP_UPLOAD_ROOT;
  if (raw === undefined) {
    // Default cookbook locations for the typical Tandoor-MCP user.
    const home = homedir();
    return [
      path.join(home, 'Downloads'),
      path.join(home, 'Pictures'),
      path.join(home, 'Documents'),
      tmpdir(),
    ];
  }
  // Explicit empty (incl. whitespace-only) is deny-all — distinct from unset.
  if (raw.trim() === '') return [];
  return raw.split(DELIM)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(expandHome(p)));
}

interface ResolvedRoots {
  /** Roots that resolved cleanly (used for the under-check). */
  resolved: string[];
  /** Roots configured but failed to resolve — surfaced to operator + user. */
  unreachable: string[];
}

// Memoize across calls keyed on env string identity. Reset when the env
// value changes (e.g. test mutates process.env). This drops per-upload work
// from N+1 realpath syscalls to 1 (only the user's path).
let _cache: { key: string | undefined; rr: ResolvedRoots } | null = null;
const _loggedUnreachable = new Set<string>();

async function getResolvedRoots(env: NodeJS.ProcessEnv = process.env): Promise<ResolvedRoots> {
  const key = env.TANDOOR_MCP_UPLOAD_ROOT;
  if (_cache && _cache.key === key) return _cache.rr;
  const roots = getAllowedRoots(env);
  const resolved: string[] = [];
  const unreachable: string[] = [];
  for (const r of roots) {
    try { resolved.push(await realpath(r)); }
    catch {
      unreachable.push(r);
      if (!_loggedUnreachable.has(r)) {
        _loggedUnreachable.add(r);
        // Stderr — visible to the operator. Not echoed to the LLM unless
        // a rejection fires (rejection message includes the list).
        console.error(`[tandoor-mcp] upload root unresolvable (check TANDOOR_MCP_UPLOAD_ROOT): ${r}`);
      }
    }
  }
  _cache = { key, rr: { resolved, unreachable } };
  return _cache.rr;
}

/** Test-only: clear the cache + the logged-unreachable set. */
export function _resetPathGuardCache(): void {
  _cache = null;
  _loggedUnreachable.clear();
}

/** True if `child` is `root` or lives under it. */
function isUnder(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export class PathGuardError extends Error {
  readonly userPath: string;
  constructor(userPath: string, message: string) {
    super(message);
    this.name = 'PathGuardError';
    this.userPath = userPath;
  }
}

export interface ValidatedPath {
  /** The realpath of the user's file. Use with openSafeUpload, never bare readFile. */
  safePath: string;
  /** Inode + device captured at validation time. Re-checked after open to detect TOCTOU. */
  ino: number | bigint;
  dev: number | bigint;
}

/**
 * Resolve `userPath` to a real, absolute path AND assert it lives inside
 * one of the allowed roots. Captures the file's inode + device so the
 * caller can verify the same file is being read (TOCTOU defense). Throws
 * `PathGuardError` with operator-actionable wording on any rejection.
 *
 * **Callers must open the returned `safePath` via `openSafeUpload` — not
 * `readFile` — to keep the TOCTOU defense intact.**
 */
export async function assertSafeUploadPath(userPath: string): Promise<ValidatedPath> {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new PathGuardError(String(userPath), 'file_path is required and must be a non-empty string');
  }
  const expanded = path.resolve(expandHome(userPath));
  let stat: BigIntStats;
  let real: string;
  try {
    // bigint mode so ino/dev are bigint — matches fh.stat({ bigint: true })
    // used in openSafeUpload, no cross-type comparison gymnastics.
    stat = await lstat(expanded, { bigint: true });
    real = await realpath(expanded);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PathGuardError(userPath, `file_path could not be resolved: ${msg}`);
  }
  const { resolved, unreachable } = await getResolvedRoots();
  for (const root of resolved) {
    if (isUnder(real, root)) {
      return { safePath: real, ino: stat.ino, dev: stat.dev };
    }
  }
  const allowedList = resolved.length ? resolved.join(DELIM) : '(none — TANDOOR_MCP_UPLOAD_ROOT is empty)';
  const unreachableHint = unreachable.length
    ? ` Unreachable (check config): ${unreachable.join(DELIM)}.`
    : '';
  throw new PathGuardError(
    userPath,
    `file_path is outside the allowed upload roots. Allowed: ${allowedList}.${unreachableHint} ` +
    `Set TANDOOR_MCP_UPLOAD_ROOT to add additional roots.`,
  );
}

/**
 * Open a validated upload path with TOCTOU protection.
 *
 * 1. O_NOFOLLOW where supported (POSIX) — open refuses if the path is now
 *    a symlink (it wasn't at validation time, so a swap was attempted).
 * 2. Post-open fstat — re-checks the file's inode + device against what
 *    validation saw. A rename/replace race between validate and open
 *    surfaces as `PathGuardError` instead of silently uploading the
 *    wrong file.
 *
 * Caller MUST close the returned handle (the convenience method below does).
 */
export async function openSafeUpload(validated: ValidatedPath): Promise<FileHandle> {
  // O_NOFOLLOW is POSIX. Windows ignores unknown flags so the open still
  // works there; the ino/dev check below is the cross-platform fallback.
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let fh: FileHandle;
  try {
    fh = await fsOpen(validated.safePath, flags);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PathGuardError(validated.safePath, `file_path open refused (possibly a symlink race): ${msg}`);
  }
  try {
    const st = await fh.stat({ bigint: true });
    if (st.ino !== validated.ino || st.dev !== validated.dev) {
      await fh.close();
      throw new PathGuardError(
        validated.safePath,
        'file_path identity changed between validation and open (TOCTOU race detected)',
      );
    }
    return fh;
  } catch (err) {
    if (!(err instanceof PathGuardError)) await fh.close().catch(() => {});
    throw err;
  }
}

/**
 * Convenience: assertSafeUploadPath → openSafeUpload → readFile → close.
 * The right default for handlers that just want the bytes.
 */
export async function readSafeUpload(userPath: string): Promise<{ data: Buffer; safePath: string }> {
  const validated = await assertSafeUploadPath(userPath);
  const fh = await openSafeUpload(validated);
  try {
    const data = await fh.readFile();
    return { data, safePath: validated.safePath };
  } finally {
    await fh.close();
  }
}
