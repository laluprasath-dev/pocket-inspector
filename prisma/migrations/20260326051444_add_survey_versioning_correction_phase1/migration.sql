-- CreateEnum
CREATE TYPE "SurveyExecutionStatus" AS ENUM ('IN_PROGRESS', 'INSPECTOR_COMPLETED');

-- AlterEnum
ALTER TYPE "SurveyStatus" ADD VALUE 'PLANNED';

-- AlterTable
ALTER TABLE "building_assignment_events" ADD COLUMN     "surveyId" TEXT;

-- AlterTable
ALTER TABLE "building_assignments" ADD COLUMN     "surveyId" TEXT;

-- AlterTable
ALTER TABLE "surveys" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activatedById" TEXT,
ADD COLUMN     "executionStatus" "SurveyExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "inspectorCompletedAt" TIMESTAMP(3),
ADD COLUMN     "inspectorCompletedById" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT,
ADD COLUMN     "scheduledStartAt" TIMESTAMP(3);

-- Backfill existing survey lifecycle metadata conservatively.
-- Legacy survey rows predate survey-level execution tracking, so historical
-- inspector completion/reopen/activation actors remain intentionally unknown.
UPDATE "surveys"
SET
    "executionStatus" = 'IN_PROGRESS',
    "activatedAt" = COALESCE("activatedAt", "startedAt")
WHERE "status" = 'ACTIVE';

UPDATE "surveys"
SET "activatedAt" = COALESCE("activatedAt", "startedAt")
WHERE "status" = 'COMPLETED';

-- Backfill assignment survey links only when the current building state is
-- unambiguous: an open assignment on a building with exactly one active survey.
WITH active_survey_per_building AS (
    SELECT
        "buildingId",
        MIN("id") AS "surveyId"
    FROM "surveys"
    WHERE "status" = 'ACTIVE'
    GROUP BY "buildingId"
    HAVING COUNT(*) = 1
)
UPDATE "building_assignments" AS ba
SET "surveyId" = active."surveyId"
FROM active_survey_per_building AS active
WHERE ba."surveyId" IS NULL
  AND ba."accessEndedAt" IS NULL
  AND ba."buildingId" = active."buildingId";

-- Backfill assignment events conservatively from already-linked assignments.
-- Historical or otherwise ambiguous events intentionally remain NULL.
UPDATE "building_assignment_events" AS bae
SET "surveyId" = ba."surveyId"
FROM "building_assignments" AS ba
WHERE bae."surveyId" IS NULL
  AND bae."assignmentId" = ba."id"
  AND ba."surveyId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "building_assignment_events_surveyId_createdAt_idx" ON "building_assignment_events"("surveyId", "createdAt");

-- CreateIndex
CREATE INDEX "building_assignments_surveyId_inspectorId_accessEndedAt_idx" ON "building_assignments"("surveyId", "inspectorId", "accessEndedAt");

-- CreateIndex
CREATE INDEX "building_assignments_buildingId_surveyId_accessEndedAt_idx" ON "building_assignments"("buildingId", "surveyId", "accessEndedAt");

-- Deferred constraint:
-- a PostgreSQL partial unique index for one ACTIVE survey per building is not
-- added in this phase because existing environments may already contain legacy
-- duplicate ACTIVE rows, and failing this additive migration would be riskier
-- than deferring the DB-level guard to a dedicated cleanup phase.

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_inspectorCompletedById_fkey" FOREIGN KEY ("inspectorCompletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
