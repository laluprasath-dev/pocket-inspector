import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from '../src/common/utils/email';

type UserRow = {
  id: string;
  email: string;
};

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    const byNormalized = new Map<string, UserRow[]>();
    for (const user of users) {
      const normalized = normalizeEmail(user.email);
      const current = byNormalized.get(normalized) ?? [];
      current.push(user);
      byNormalized.set(normalized, current);
    }

    const collisions = Array.from(byNormalized.entries()).filter(
      ([, rows]) => rows.length > 1,
    );
    if (collisions.length > 0) {
      console.error('\n❌ Cannot normalize user emails because collisions exist.\n');
      for (const [normalized, rows] of collisions) {
        console.error(`- ${normalized}`);
        for (const row of rows) {
          console.error(`  • ${row.id} -> ${row.email}`);
        }
      }
      process.exit(1);
    }

    const updates = users
      .map((user) => ({
        id: user.id,
        from: user.email,
        to: normalizeEmail(user.email),
      }))
      .filter((user) => user.from !== user.to);

    for (const update of updates) {
      await prisma.user.update({
        where: { id: update.id },
        data: { email: update.to },
      });
    }

    console.log(`✅ Normalized ${updates.length} user email(s).`);
    if (updates.length > 0) {
      for (const update of updates) {
        console.log(`- ${update.from} -> ${update.to}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌ Failed to normalize user emails.\n');
  console.error(error);
  process.exit(1);
});
