// Enforces the top-of-file warning in test/stdio-protocol-e2e.test.ts —
// that file uses module-level `mode` + `tandoorVersionMode` flags driving a
// shared stub server, so `.concurrent` would tear results across scenarios.
// The comment is the documentation; this test is the lock (QA F6).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('stdio-protocol-e2e concurrency guard', () => {
  it('the file does not invoke `describe.concurrent(` / `test.concurrent(` / `it.concurrent(`', () => {
    const src = readFileSync(path.join(REPO, 'test', 'stdio-protocol-e2e.test.ts'), 'utf8');
    // Require the call form `.concurrent(` so comments describing the
    // prohibition (which spell out `describe.concurrent` without parens)
    // don't trip this guard. Real API usage always has parens.
    expect(src).not.toMatch(/\b(describe|test|it)\.concurrent\s*\(/);
  });
});
