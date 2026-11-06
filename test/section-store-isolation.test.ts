import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { sectionsFile } from '../src/lib/section-store.js';

describe('test run isolation', () => {
  it('saves sections under the temp dir, never the real home, unless a test picks its own', () => {
    expect(sectionsFile(process.env).startsWith(tmpdir())).toBe(true);
  });
});
