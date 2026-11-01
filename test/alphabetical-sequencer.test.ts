import { describe, expect, it } from 'vitest';
import type { TestSpecification, Vitest } from 'vitest/node';
import { AlphabeticalSequencer } from './e2e/alphabetical-sequencer.js';

describe('AlphabeticalSequencer', () => {
  it('orders test files by path', async () => {
    const specs = ['/r/test/e2e/pantry-resource.e2e.test.ts', '/r/test/e2e/auto-meal-plan.e2e.test.ts', '/r/test/e2e/inventory.e2e.test.ts'].map(
      (moduleId) => ({ moduleId }) as TestSpecification,
    );
    const sorted = await new AlphabeticalSequencer({} as Vitest).sort(specs);
    expect(sorted.map((s) => s.moduleId)).toEqual([
      '/r/test/e2e/auto-meal-plan.e2e.test.ts',
      '/r/test/e2e/inventory.e2e.test.ts',
      '/r/test/e2e/pantry-resource.e2e.test.ts',
    ]);
  });
});
