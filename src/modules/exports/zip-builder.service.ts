import { Injectable, Logger } from '@nestjs/common';
import archiver, { type Archiver } from 'archiver';
import { BulkExportJob } from '../../../generated/prisma/client';
import { ExportTargetType } from '../../../generated/prisma/enums';
import { GcsService } from '../storage/gcs.service';
import { StoragePathBuilder } from '../storage/storage-path.builder';
import { PrismaService } from '../../prisma/prisma.service';

interface BuildingContext {
  buildingId: string;
  buildingName: string;
  orgId: string;
  siteId: string | null;
}

@Injectable()
export class ZipBuilderService {
  private readonly logger = new Logger(ZipBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
  ) {}

  async build(job: BulkExportJob): Promise<string> {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const zipPath = StoragePathBuilder.exportZip({
      orgId: job.orgId,
      targetType: job.targetType,
      targetId: job.targetId,
      jobId: job.id,
    });

    const uploadPromise = this.gcs.streamToGcs(
      zipPath,
      archive as unknown as NodeJS.ReadableStream extends never
        ? never
        : import('stream').Readable,
    );

    switch (job.targetType) {
      case ExportTargetType.BUILDING:
        await this.addBuilding(archive, job.targetId, job.orgId);
        break;
      case ExportTargetType.FLOOR:
        await this.addFloor(archive, job.targetId, job.orgId, '');
        break;
      case ExportTargetType.DOOR:
        await this.addDoor(archive, job.targetId, '');
        break;
      case ExportTargetType.SITE:
        await this.addSite(archive, job.targetId, job.orgId);
        break;
      case ExportTargetType.INSPECTION:
        await this.addInspection(archive, job.targetId, job.orgId);
        break;
    }

    await archive.finalize();
    await uploadPromise;
    return zipPath;
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private async addBuilding(
    archive: Archiver,
    buildingId: string,
    orgId: string,
    prefix = '',
  ): Promise<void> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
      include: {
        floors: {
          include: {
            doors: {
              include: { images: true, certificate: true },
            },
          },
        },
        certificate: true,
      },
    });
    if (!building) return;

    const ctx: BuildingContext = {
      buildingId: building.id,
      buildingName: building.name,
      orgId,
      siteId: building.siteId,
    };

    const bPrefix = `${prefix}Building_${this.sanitize(building.name)}`;

    for (const floor of building.floors) {
      await this.addFloor(archive, floor.id, orgId, bPrefix, ctx);
    }

    if (building.certificate) {
      this.appendGcsFile(
        archive,
        building.certificate.objectPathCertificate,
        `${bPrefix}/certificates/building_certificate.pdf`,
      );
    }
  }

  private async addFloor(
    archive: Archiver,
    floorId: string,
    orgId: string,
    buildingPrefix: string,
    ctx?: BuildingContext,
  ): Promise<void> {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, building: { orgId } },
      include: {
        building: {
          select: { id: true, name: true, siteId: true, orgId: true },
        },
        doors: { include: { images: true, certificate: true } },
      },
    });
    if (!floor) return;

    const resolvedCtx = ctx ?? {
      buildingId: floor.building.id,
      buildingName: floor.building.name,
      orgId: floor.building.orgId,
      siteId: floor.building.siteId,
    };

    const bp =
      buildingPrefix || `Building_${this.sanitize(resolvedCtx.buildingName)}`;
    const floorLabel = floor.label ?? floor.id.slice(0, 8);
    const fPrefix = `${bp}/Floor_${this.sanitize(floorLabel)}`;

    for (const door of floor.doors) {
      await this.addDoor(archive, door.id, fPrefix, resolvedCtx, floor.id);
    }
  }

  private async addDoor(
    archive: Archiver,
    doorId: string,
    floorPrefix: string,
    ctx?: BuildingContext,
    floorId?: string,
  ): Promise<void> {
    const door = await this.prisma.door.findUnique({
      where: { id: doorId },
      include: {
        images: true,
        certificate: true,
        floor: {
          include: {
            building: { select: { id: true, siteId: true, orgId: true } },
          },
        },
      },
    });
    if (!door) return;

    const dPrefix = floorPrefix
      ? `${floorPrefix}/Door_${this.sanitize(door.code)}`
      : `Door_${this.sanitize(door.code)}`;

    const resolvedFloorId = floorId ?? door.floor.id;
    const resolvedCtx = ctx ?? {
      buildingId: door.floor.building.id,
      buildingName: '',
      orgId: door.floor.building.orgId,
      siteId: door.floor.building.siteId,
    };

    for (const image of door.images) {
      const role = image.role.toLowerCase();
      const fileName =
        image.objectPathOriginal.split('/').pop() ?? `${image.id}.jpg`;
      this.appendGcsFile(
        archive,
        image.objectPathOriginal,
        `${dPrefix}/${role}/${fileName}`,
      );
    }

    if (door.certificate) {
      this.appendGcsFile(
        archive,
        door.certificate.objectPathCertificate,
        `${dPrefix}/certificates/door_certificate.pdf`,
      );
    }

    void resolvedFloorId;
    void resolvedCtx;
  }

  private async addSite(
    archive: Archiver,
    siteId: string,
    orgId: string,
  ): Promise<void> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, orgId },
    });
    if (!site) return;

    const buildings = await this.prisma.building.findMany({
      where: { siteId, orgId },
      select: { id: true },
    });

    const sitePrefix = `Site_${this.sanitize(site.name)}`;
    for (const b of buildings) {
      await this.addBuilding(archive, b.id, orgId, sitePrefix);
    }
  }

  private async addInspection(
    archive: Archiver,
    inspectionId: string,
    orgId: string,
  ): Promise<void> {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, orgId },
      select: { type: true, buildingId: true, siteId: true },
    });
    if (!inspection) return;

    if (inspection.buildingId) {
      await this.addBuilding(archive, inspection.buildingId, orgId);
    } else if (inspection.siteId) {
      await this.addSite(archive, inspection.siteId, orgId);
    }
  }

  private appendGcsFile(
    archive: Archiver,
    objectPath: string,
    archiveName: string,
  ): void {
    try {
      const stream = this.gcs.createReadStream(objectPath);
      archive.append(stream, { name: archiveName });
    } catch (err) {
      this.logger.warn(`Could not append ${objectPath}: ${String(err)}`);
    }
  }

  private sanitize(name: string): string {
    return name
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }
}
