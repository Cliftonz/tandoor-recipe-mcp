import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { COVERS, PENDING_WRITES, SKIPS } from './helpers/coverage.js';
import { allTools } from './helpers/tools.js';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

describe('real-Tandoor e2e coverage', () => {
  let tools: Tool[];
  let writes: Set<string>;
  const covered = new Set(Object.values(COVERS).flat());
  const skipped = new Set(SKIPS.filter((s) => !s.arg).map((s) => s.tool));

  beforeAll(async () => {
    tools = await allTools();
    writes = new Set(tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name));
    process.stderr.write(`  coverage: ${tools.length} tools, ${SKIPS.length} reviewed skip(s), ${PENDING_WRITES.length} pending write(s)\n`);
  });

  it('accounts for every tool as a swept read, a covered write, a reviewed skip, or a pending write', () => {
    const accounted = new Set([...covered, ...skipped, ...PENDING_WRITES]);
    expect([...writes].filter((t) => !accounted.has(t))).toEqual([]);
  });

  it('names only registered tools', () => {
    const names = new Set(tools.map((t) => t.name));
    expect([...covered, ...skipped, ...PENDING_WRITES].filter((t) => !names.has(t))).toEqual([]);
  });

  it('keeps pending writes to exactly the uncovered write tools', () => {
    expect(PENDING_WRITES.filter((t) => !writes.has(t) || covered.has(t) || skipped.has(t))).toEqual([]);
    expect(new Set(PENDING_WRITES).size).toBe(PENDING_WRITES.length);
  });

  it('gives every reviewed skip a reason', () => {
    expect(SKIPS.filter((s) => !s.reason.trim())).toEqual([]);
  });

  it('keys covers by existing e2e files', () => {
    expect(Object.keys(COVERS).filter((f) => !existsSync(path.join(E2E_DIR, f)))).toEqual([]);
  });
});
