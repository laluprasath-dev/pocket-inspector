import { Injectable, NotFoundException } from '@nestjs/common';
import { Building, Floor } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { GcsService } from '../storage/gcs.service';
import { StoragePathBuilder } from '../storage/storage-path.builder';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { RegisterBuildingCertificateDto } from './dto/register-building-certificate.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll(
    orgId: string,
    userId: string,
    role: Role,
    siteId?: string,
  ): Promise<Building[]> {
    return this.prisma.building.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        ...this.accessFilter(orgId, userId, role),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(
    id: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<Building> {
    const building = await this.prisma.building.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: { certificate: true },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);
    return building;
  }

  create(
    dto: CreateBuildingDto,
    orgId: string,
    userId: string,
  ): Promise<Building> {
    return this.prisma.building.create({
      data: { ...dto, orgId, createdById: userId },
    });
  }

  async update(
    id: string,
    dto: UpdateBuildingDto,
    orgId: string,
  ): Promise<Building> {
    const building = await this.prisma.building.findFirst({
      where: { id, orgId },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);
    return this.prisma.building.update({ where: { id }, data: dto });
  }

  async getFloors(
    buildingId: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<Floor[]> {
    await this.findById(buildingId, orgId, userId, role);
    return this.prisma.floor.findMany({
      where: { buildingId },
      orderBy: { label: 'asc' },
    });
  }

  // ── Building certificate ───────────────────────────────────────────────────

  async requestCertificateUpload(buildingId: string, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    const certId = crypto.randomUUID();
    const objectPath = StoragePathBuilder.buildingCertificate({
      orgId,
      siteId: building.siteId,
      buildingId,
      certId,
    });

    const signedUrl = await this.gcs.getSignedUploadUrl({
      objectPath,
      contentType: 'application/pdf',
    });
    return { signedUrl, objectPath, certId };
  }

  async registerCertificate(
    buildingId: string,
    dto: RegisterBuildingCertificateDto,
    adminId: string,
    orgId: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    const cert = await this.prisma.buildingCertificate.upsert({
      where: { buildingId },
      create: {
        buildingId,
        objectPathCertificate: dto.objectPath,
        uploadedById: adminId,
      },
      update: {
        objectPathCertificate: dto.objectPath,
        uploadedById: adminId,
        uploadedAt: new Date(),
      },
    });

    const inspectorIds = await this.getInspectorIdsForBuilding(buildingId);
    await this.notifications.notifyUsers(inspectorIds, {
      title: 'Building certificate available',
      body: 'The building certificate has been uploaded.',
      data: { buildingId, type: 'BUILDING_CERTIFIED' },
    });

    return cert;
  }

  async getCertificateDownloadUrl(
    buildingId: string,
    orgId: string,
  ): Promise<string> {
    const cert = await this.prisma.buildingCertificate.findFirst({
      where: { buildingId, building: { orgId } },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this building');

    return this.gcs.getSignedDownloadUrl({
      objectPath: cert.objectPathCertificate,
    });
  }

  // ── Access filter ─────────────────────────────────────────────────────────
  // ADMIN: all buildings in the org
  // INSPECTOR: buildings they created OR are assigned to via an inspection

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { orgId };

    return {
      orgId,
      OR: [
        { createdById: userId },
        {
          inspections: {
            some: { assignments: { some: { inspectorId: userId } } },
          },
        },
      ],
    };
  }

  private async getInspectorIdsForBuilding(
    buildingId: string,
  ): Promise<string[]> {
    const inspections = await this.prisma.inspection.findMany({
      where: { buildingId },
      include: { assignments: { select: { inspectorId: true } } },
    });

    const ids = new Set<string>();
    for (const inspection of inspections) {
      for (const assignment of inspection.assignments) {
        ids.add(assignment.inspectorId);
      }
    }
    return Array.from(ids);
  }
}
