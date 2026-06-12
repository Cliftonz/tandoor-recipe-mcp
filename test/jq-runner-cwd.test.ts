// Regression: the jq worker must resolve jq-wasm from this package's own
// node_modules, not the process cwd. When the server is installed via
// npx/global and launched from an arbitrary directory, a cwd-relative
// import('jq-wasm') in the eval worker fails with "Cannot find package
// 'jq-wasm' imported from /[worker eval]".

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJq, _resetJqWorker } from '../src/lib/jq-runner.js';

const originalCwd = process.cwd();
let scratch: string;

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'jq-cwd-'));
  await _resetJqWorker();
  process.chdir(scratch);
});

afterAll(async () => {
  process.chdir(originalCwd);
  await _resetJqWorker();
  rmSync(scratch, { recursive: true, force: true });
});

describe('jq worker module resolution', () => {
  it('runs jq even when cwd has no node_modules', async () => {
    const r = await runJq('{"results":[{"id":1,"name":"a","junk":true}]}', '.results | map({id, name})');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ id: 1, name: 'a' }]);
  });
});
