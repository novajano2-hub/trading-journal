import { defineConfig } from 'vitest/config';

// Timing-budget tests are flaky under machine load; they run via `npm run test:perf`.
const perf = process.env.KEEL_PERF === '1';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    testTimeout: 30000,
    ...(perf ? {} : { testNamePattern: /^(?!.*(budget|under 50 ms)).*$/ }),
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
