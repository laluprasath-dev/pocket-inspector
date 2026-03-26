-- CreateEnum
CREATE TYPE "BuildingAssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REMOVED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "BuildingWorkflowStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BuildingAssignmentEventType" AS ENUM ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'ACCESS_REMOVED', 'REASSIGNED', 'BUILDING_COMPLETED', 'BUILDING_REOPENED');

-- CreateTable
CREATE TABLE "building_assignment_groups" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "building_assignment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_assignments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "groupId" TEXT,
    "assignedById" TEXT NOT NULL,
    "status" "BuildingAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "inspectorNote" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "accessEndedAt" TIMESTAMP(3),
    "endedById" TEXT,

    CONSTRAINT "building_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_workflow_states" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "status" "BuildingWorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_assignment_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "groupId" TEXT,
    "inspectorId" TEXT,
    "actorId" TEXT NOT NULL,
    "type" "BuildingAssignmentEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "building_assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "building_assignment_groups_orgId_createdAt_idx" ON "building_assignment_groups"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "building_assignment_groups_siteId_idx" ON "building_assignment_groups"("siteId");

-- CreateIndex
CREATE INDEX "building_assignments_orgId_inspectorId_accessEndedAt_idx" ON "building_assignments"("orgId", "inspectorId", "accessEndedAt");

-- CreateIndex
CREATE INDEX "building_assignments_buildingId_accessEndedAt_idx" ON "building_assignments"("buildingId", "accessEndedAt");

-- CreateIndex
CREATE INDEX "building_assignments_groupId_idx" ON "building_assignments"("groupId");

-- CreateIndex
CREATE INDEX "building_assignments_status_idx" ON "building_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "building_workflow_states_buildingId_key" ON "building_workflow_states"("buildingId");

-- CreateIndex
CREATE INDEX "building_workflow_states_orgId_status_idx" ON "building_workflow_states"("orgId", "status");

-- CreateIndex
CREATE INDEX "building_assignment_events_orgId_createdAt_idx" ON "building_assignment_events"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "building_assignment_events_inspectorId_createdAt_idx" ON "building_assignment_events"("inspectorId", "createdAt");

-- CreateIndex
CREATE INDEX "building_assignment_events_buildingId_createdAt_idx" ON "building_assignment_events"("buildingId", "createdAt");

-- CreateIndex
CREATE INDEX "building_assignment_events_type_createdAt_idx" ON "building_assignment_events"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "building_assignment_groups" ADD CONSTRAINT "building_assignment_groups_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_groups" ADD CONSTRAINT "building_assignment_groups_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_groups" ADD CONSTRAINT "building_assignment_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "building_assignment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignments" ADD CONSTRAINT "building_assignments_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_workflow_states" ADD CONSTRAINT "building_workflow_states_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_workflow_states" ADD CONSTRAINT "building_workflow_states_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_workflow_states" ADD CONSTRAINT "building_workflow_states_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_workflow_states" ADD CONSTRAINT "building_workflow_states_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "building_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "building_assignment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_assignment_events" ADD CONSTRAINT "building_assignment_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
