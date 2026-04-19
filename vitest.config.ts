import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // E2E lives in test/e2e and is opt-in via `npm run test:e2e`.
    // Excluded from the default `npm test` run so CI never touches a live
    // Tandoor instance.
    exclude: ['test/e2e/**', '**/node_modules/**'],
    globals: false,
    environment: 'node',
    testTimeout: 30_000,
  },
});
