-- CreateEnum
CREATE TYPE "BuildingStatus" AS ENUM ('DRAFT', 'APPROVED', 'CERTIFIED');

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "certifiedAt" TIMESTAMP(3),
ADD COLUMN     "certifiedById" TEXT,
ADD COLUMN     "status" "BuildingStatus" NOT NULL DEFAULT 'DRAFT';

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
