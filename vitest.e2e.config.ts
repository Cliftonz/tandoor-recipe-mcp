import { defineConfig } from 'vitest/config';

// Separate config for end-to-end tests that hit a real Tandoor instance.
// Requires TANDOOR_URL + TANDOOR_TOKEN. Run in an ISOLATED space — the suite
// creates and deletes real data.
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.test.ts'],
    globals: false,
    environment: 'node',
    // Live HTTP round-trips + AI imports can be slow; give each test headroom.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Force serial execution — tests share created resources through a
    // module-level tracker and cannot run in parallel safely.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
