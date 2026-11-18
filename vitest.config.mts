import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Must match TEST_DATABASE_URL in test/test-env.ts (used by global setup).
const TEST_DATABASE_URL = 'file:./test.db';

export default defineConfig({
  // SWC emits decorator metadata, which NestJS dependency injection needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    passWithNoTests: true,
    globalSetup: ['test/global-setup.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    // All test files share one SQLite file; run them one at a time.
    fileParallelism: false,
  },
});
