// Save/restore the stash env vars around each test. Without this, a test
// that sets TANDOOR_MCP_STASH_THRESHOLD=500 leaks the value into every
// subsequent test in the file (and, for serial runners, the next file).
//
// Uses Vitest's beforeEach/afterEach hooks. Call `useStashEnv()` once at the
// top of any describe block (or the file) that mutates these vars.

import { beforeEach, afterEach } from 'vitest';

export const STASH_ENV_KEYS = [
  'TANDOOR_MCP_STASH_ENABLED',
  'TANDOOR_MCP_STASH_THRESHOLD',
  'TANDOOR_MCP_STASH_MAX_ENTRIES',
  'TANDOOR_MCP_STASH_MAX_BYTES',
  'TANDOOR_MCP_STASH_TTL_MS',
] as const;

export function useStashEnv(): void {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of STASH_ENV_KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of STASH_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });
}
