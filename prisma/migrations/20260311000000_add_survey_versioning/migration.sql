-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable: add surveyId (nullable) to building_certificates and drop old unique on buildingId
ALTER TABLE "building_certificates" DROP CONSTRAINT IF EXISTS "building_certificates_buildingId_key";
ALTER TABLE "building_certificates" ADD COLUMN "surveyId" TEXT;

-- AlterTable: add surveyId (nullable) to floors
ALTER TABLE "floors" ADD COLUMN "surveyId" TEXT;

-- CreateTable: surveys
CREATE TABLE "surveys" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SurveyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "nextScheduledAt" TIMESTAMP(3),
    "nextScheduledNote" TEXT,
    "nextAssignedInspectorId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique survey version per building
CREATE UNIQUE INDEX "surveys_buildingId_version_key" ON "surveys"("buildingId", "version");

-- CreateIndex: unique surveyId on building_certificates
CREATE UNIQUE INDEX "building_certificates_surveyId_key" ON "building_certificates"("surveyId");

-- AddForeignKey: surveys.orgId -> orgs.id
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: surveys.buildingId -> buildings.id
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: surveys.confirmedById -> users.id
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: surveys.nextAssignedInspectorId -> users.id
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_nextAssignedInspectorId_fkey" FOREIGN KEY ("nextAssignedInspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: surveys.createdById -> users.id
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: floors.surveyId -> surveys.id
ALTER TABLE "floors" ADD CONSTRAINT "floors_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: building_certificates.surveyId -> surveys.id
ALTER TABLE "building_certificates" ADD CONSTRAINT "building_certificates_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
