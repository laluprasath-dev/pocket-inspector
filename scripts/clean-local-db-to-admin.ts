import 'dotenv/config';
import { URL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from '../src/common/utils/email';

const DEFAULT_ORG_ID = 'seed-org-00000000000000000000000';
const DEFAULT_ORG_NAME = 'Demo Organisation';
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'Admin1234!';
const DEFAULT_ADMIN_FIRST_NAME = 'Admin';
const DEFAULT_ADMIN_LAST_NAME = 'User';
const BCRYPT_ROUNDS = 12;

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function assertLocalDatabase(connectionString: string): void {
  const allowNonLocal = process.env['ALLOW_NON_LOCAL_DB_CLEANUP'] === 'true';
  if (allowNonLocal) return;

  const parsed = new URL(connectionString);
  const host = parsed.hostname;

  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(
      [
        `Refusing to clean non-local database host "${host}".`,
        'Set ALLOW_NON_LOCAL_DB_CLEANUP=true only if you intentionally want to override this guard.',
      ].join(' '),
    );
  }
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  assertLocalDatabase(connectionString);

  const adminEmail = normalizeEmail(
    arg('--admin-email') ??
      process.env['SEED_ADMIN_EMAIL'] ??
      DEFAULT_ADMIN_EMAIL,
  );
  const adminPassword =
    arg('--admin-password') ??
    process.env['SEED_ADMIN_PASSWORD'] ??
    DEFAULT_ADMIN_PASSWORD;
  const orgName = process.env['SEED_ORG_NAME'] ?? DEFAULT_ORG_NAME;
  const firstName = arg('--first-name') ?? DEFAULT_ADMIN_FIRST_NAME;
  const lastName = arg('--last-name') ?? DEFAULT_ADMIN_LAST_NAME;

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🧹 Cleaning local database and keeping only one admin account...');
    console.log(`   Database: ${new URL(connectionString).pathname.slice(1)}`);
    console.log(`   Admin: ${adminEmail}`);

    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('_prisma_migrations', 'users', 'orgs')
        ORDER BY tablename
      `,
    );

    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

    await prisma.org.upsert({
      where: { id: DEFAULT_ORG_ID },
      create: {
        id: DEFAULT_ORG_ID,
        name: orgName,
      },
      update: {
        name: orgName,
      },
    });

    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        orgId: DEFAULT_ORG_ID,
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        firstName,
        lastName,
      },
      update: {
        orgId: DEFAULT_ORG_ID,
        passwordHash,
        role: 'ADMIN',
        firstName,
        lastName,
      },
    });

    if (tables.length > 0) {
      const tableList = tables.map((table) => quoteIdent(table.tablename)).join(', ');
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
      );
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          not: adminEmail,
        },
      },
    });

    await prisma.org.deleteMany({
      where: {
        id: {
          not: DEFAULT_ORG_ID,
        },
      },
    });

    const [usersCount, sitesCount, buildingsCount, assignmentsCount, exportsCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.site.count(),
        prisma.building.count(),
        prisma.buildingAssignment.count(),
        prisma.bulkExportJob.count(),
      ]);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
      select: {
        id: true,
        email: true,
        role: true,
        orgId: true,
        firstName: true,
        lastName: true,
      },
    });

    console.log('✅ Local database cleaned.');
    console.log(`   Users: ${usersCount}`);
    console.log(`   Sites: ${sitesCount}`);
    console.log(`   Buildings: ${buildingsCount}`);
    console.log(`   Assignments: ${assignmentsCount}`);
    console.log(`   Export jobs: ${exportsCount}`);
    console.log(`   Remaining admin: ${admin.email} (${admin.role})`);
    console.log(`   Login password: ${adminPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌ Failed to clean the local database.\n');
  console.error(error);
  process.exit(1);
});
