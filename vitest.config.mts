import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    // The integration suites share one test database; run files serially so
    // their per-test table resets don't clobber each other. The suite is small.
    fileParallelism: false,
  },
});
