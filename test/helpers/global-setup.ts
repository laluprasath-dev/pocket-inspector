import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  process.env['DATABASE_URL'] =
    'postgresql://admin@localhost:5432/pocket_inspector_test';

  execSync(
    'DATABASE_URL=postgresql://admin@localhost:5432/pocket_inspector_test npx prisma migrate deploy',
    { stdio: 'pipe', cwd: process.cwd() },
  );
}
