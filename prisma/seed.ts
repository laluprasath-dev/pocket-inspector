import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

const SEED_ORG_ID = 'seed-org-00000000000000000000000';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Running seed...');

  const org = await prisma.org.upsert({
    where: { id: SEED_ORG_ID },
    create: { id: SEED_ORG_ID, name: 'Demo Organisation' },
    update: {},
  });
  console.log(`  ✓ Org: ${org.name} (${org.id})`);

  const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com';
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin1234!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      orgId: org.id,
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'User',
    },
    update: {},
  });
  console.log(`  ✓ Admin: ${admin.email}`);

  const inspectorEmail = process.env['SEED_INSPECTOR_EMAIL'] ?? 'inspector@example.com';
  const inspectorPassword = process.env['SEED_INSPECTOR_PASSWORD'] ?? 'Inspector1234!';
  const inspectorHash = await bcrypt.hash(inspectorPassword, 12);

  const inspector = await prisma.user.upsert({
    where: { email: inspectorEmail },
    create: {
      orgId: org.id,
      email: inspectorEmail,
      passwordHash: inspectorHash,
      role: 'INSPECTOR',
      firstName: 'Demo',
      lastName: 'Inspector',
    },
    update: {},
  });
  console.log(`  ✓ Inspector: ${inspector.email}`);

  console.log('\n✅ Seed complete.\n');
  console.log(`  Admin login:     ${adminEmail} / ${adminPassword}`);
  console.log(`  Inspector login: ${inspectorEmail} / ${inspectorPassword}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
