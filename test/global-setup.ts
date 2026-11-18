import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { TEST_DATABASE_URL } from './test-env';

/** Recreates the test SQLite database and applies all migrations once per run. */
export default function setup(): void {
  rmSync('test.db', { force: true });
  rmSync('test.db-journal', { force: true });
  execSync('npx --no-install prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
