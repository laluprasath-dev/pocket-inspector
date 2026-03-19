import bcrypt from 'bcrypt';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestOrg {
  id: string;
  name: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  orgId: string;
  role: 'ADMIN' | 'INSPECTOR';
}

export interface TestSeeds {
  org: TestOrg;
  admin: TestUser;
  inspector: TestUser;
}

export async function seedTestData(prisma: PrismaService): Promise<TestSeeds> {
  const org = await prisma.org.create({ data: { name: 'Test Org' } });

  const adminPassword = 'Admin1234!';
  const inspectorPassword = 'Inspector1234!';

  const [admin, inspector] = await Promise.all([
    prisma.user.create({
      data: {
        orgId: org.id,
        email: `admin+${Date.now()}@test.com`,
        passwordHash: await bcrypt.hash(adminPassword, 4),
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'Admin',
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        email: `inspector+${Date.now()}@test.com`,
        passwordHash: await bcrypt.hash(inspectorPassword, 4),
        role: 'INSPECTOR',
        firstName: 'Test',
        lastName: 'Inspector',
      },
    }),
  ]);

  return {
    org: { id: org.id, name: org.name },
    admin: {
      id: admin.id,
      email: admin.email,
      password: adminPassword,
      orgId: org.id,
      role: 'ADMIN',
    },
    inspector: {
      id: inspector.id,
      email: inspector.email,
      password: inspectorPassword,
      orgId: org.id,
      role: 'INSPECTOR',
    },
  };
}
