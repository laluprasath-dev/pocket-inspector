import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from '../src/common/utils/email';

const SEED_ORG_ID = 'seed-org-00000000000000000000000';
const SEED_CLIENT_ID = 'seed-client-000000000000000000000';

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

  const adminEmail = normalizeEmail(
    process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com',
  );
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

  const inspectorEmail = normalizeEmail(
    process.env['SEED_INSPECTOR_EMAIL'] ?? 'inspector@example.com',
  );
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

  const client = await prisma.client.upsert({
    where: { orgId_name: { orgId: org.id, name: 'Acme Fire Safety Ltd' } },
    create: {
      id: SEED_CLIENT_ID,
      orgId: org.id,
      name: 'Acme Fire Safety Ltd',
      contactName: 'John Smith',
      contactEmail: 'john@acmefiresafety.com',
      contactPhone: '+44 20 7946 0958',
      address: '123 King Street, London EC2V 8AA',
      notes: 'Primary client — monthly billing cycle',
      createdById: admin.id,
    },
    update: {},
  });
  console.log(`  ✓ Client: ${client.name} (${client.id})`);

  console.log('\n✅ Seed complete.\n');
  console.log(`  Admin login:     ${adminEmail} / ${adminPassword}`);
  console.log(`  Inspector login: ${inspectorEmail} / ${inspectorPassword}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
