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
    // Pool: forks (not threads) because stdio-protocol-e2e + pack-smoke each
    // child_process.spawn a Node server per scenario; stdio FDs don't share
    // safely across worker threads on a single libuv loop. Forks give each
    // suite a real PID + isolated event loop.
    //
    // Fork cap is environment-dependent: on CI (GH-hosted ubuntu: 2 vCPU /
    // 7GB) two forks is the right ceiling to keep the spawn-heavy suites
    // from OOM-ing; on a developer's larger machine the rest of the suite
    // (in-process handler tests) benefits from broader fan-out.
    // vitest 4: pool options are top-level; forks.maxForks → maxWorkers.
    pool: 'forks',
    maxWorkers: process.env.CI ? 2 : undefined,
  },
});
