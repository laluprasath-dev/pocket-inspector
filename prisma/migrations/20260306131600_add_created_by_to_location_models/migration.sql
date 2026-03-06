-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "doors" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "floors" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doors" ADD CONSTRAINT "doors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
