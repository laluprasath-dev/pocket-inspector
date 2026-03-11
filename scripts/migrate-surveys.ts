/**
 * Data migration: backfill Survey v1 records for all existing buildings.
 *
 * For every building that has floors or a building certificate, this script:
 *   1. Creates a Survey record (version=1, status=ACTIVE, startedAt=building.createdAt)
 *   2. Links all floors of that building to the created survey
 *   3. Links the existing BuildingCertificate (if any) to the survey
 *
 * Run once after the add_survey_versioning DDL migration has been applied.
 *
 *   npx ts-node --transpile-only scripts/migrate-surveys.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const buildings = await prisma.building.findMany({
    include: {
      floors: true,
      certificates: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${buildings.length} buildings to process.`);

  let created = 0;
  let skipped = 0;

  for (const building of buildings) {
    // Check if a survey already exists for this building
    const existing = await prisma.survey.findFirst({
      where: { buildingId: building.id },
    });

    if (existing) {
      console.log(
        `  SKIP building ${building.id} "${building.name}" — survey already exists (v${existing.version})`,
      );
      skipped++;
      continue;
    }

    // Only create a survey if the building has floors or a certificate
    if (building.floors.length === 0 && building.certificates.length === 0) {
      console.log(
        `  SKIP building ${building.id} "${building.name}" — no floors or certificates, will get a survey when first floor is created`,
      );
      skipped++;
      continue;
    }

    // Determine the admin who created the building, or use a system fallback
    const createdById =
      building.createdById ??
      building.certifiedById ??
      building.approvedById ??
      (await getFirstAdminId(building.orgId));

    if (!createdById) {
      console.warn(
        `  WARN building ${building.id} "${building.name}" — could not determine a user to assign as createdBy, skipping`,
      );
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const survey = await tx.survey.create({
        data: {
          orgId: building.orgId,
          buildingId: building.id,
          version: 1,
          status: 'ACTIVE',
          startedAt: building.createdAt,
          createdById,
          createdAt: building.createdAt,
        },
      });

      // Link all floors to this survey
      if (building.floors.length > 0) {
        await tx.floor.updateMany({
          where: { buildingId: building.id, surveyId: null },
          data: { surveyId: survey.id },
        });
      }

      // Link building certificate to this survey
      if (building.certificates.length > 0) {
        for (const cert of building.certificates) {
          await tx.buildingCertificate.update({
            where: { id: cert.id },
            data: { surveyId: survey.id },
          });
        }
      }

      console.log(
        `  OK  building ${building.id} "${building.name}" — created Survey v1 (${survey.id}), linked ${building.floors.length} floor(s), ${building.certificates.length} cert(s)`,
      );
    });

    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

async function getFirstAdminId(orgId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { orgId, role: 'ADMIN' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
