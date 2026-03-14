import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Building, Floor } from '../../../generated/prisma/client';
import {
  BuildingStatus,
  Role,
  SurveyStatus,
} from '../../../generated/prisma/enums';
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

  async findAll(
    orgId: string,
    userId: string,
    role: Role,
    siteId?: string,
  ): Promise<Building[]> {
    const buildings = await this.prisma.building.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        ...this.accessFilter(orgId, userId, role),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { floors: true },
        },
        floors: {
          include: {
            _count: { select: { doors: true } },
          },
        },
      },
    });
    return buildings.map((b) => {
      const noOfFloors = b._count.floors;
      const noOfDoors = b.floors.reduce((sum, f) => sum + f._count.doors, 0);
      const { _count, floors, ...rest } = b;
      return {
        ...rest,
        noOfFloors,
        noOfDoors,
      };
    });
  }

  async findById(id: string, orgId: string, userId: string, role: Role) {
    const building = await this.prisma.building.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: {
        _count: { select: { floors: true } },
        floors: {
          include: { _count: { select: { doors: true } } },
        },
        surveys: {
          where: { status: SurveyStatus.ACTIVE },
          include: {
            buildingCertificate: { select: { id: true, uploadedAt: true } },
          },
          take: 1,
        },
      },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);

    const activeSurvey = building.surveys[0] ?? null;
    const noOfFloors = building._count.floors;
    const noOfDoors = building.floors.reduce(
      (sum, f) => sum + f._count.doors,
      0,
    );

    return {
      id: building.id,
      orgId: building.orgId,
      siteId: building.siteId,
      name: building.name,
      buildingCode: building.buildingCode,
      locationNotes: building.locationNotes,
      createdById: building.createdById,
      createdAt: building.createdAt,
      status: building.status,
      approvedAt: building.approvedAt,
      approvedById: building.approvedById,
      certifiedAt: building.certifiedAt,
      certifiedById: building.certifiedById,
      noOfFloors,
      noOfDoors,
      currentSurveyId: activeSurvey?.id ?? null,
      currentSurveyVersion: activeSurvey?.version ?? null,
      certificatePresent:
        activeSurvey?.buildingCertificate !== null && activeSurvey !== null,
      certificateUploadedAt:
        activeSurvey?.buildingCertificate?.uploadedAt ?? null,
    };
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

    // Find the active survey to filter floors
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });

    // If no active survey exists yet (building has no survey), return all floors
    // that have no surveyId (legacy data without survey assignment).
    // Once a survey exists, only return floors tied to that survey.
    const where = activeSurvey
      ? { buildingId, surveyId: activeSurvey.id }
      : { buildingId, surveyId: null as string | null };

    return this.prisma.floor.findMany({
      where,
      orderBy: { label: 'asc' },
    });
  }

  // ── Inspector approval ─────────────────────────────────────────────────────

  async approve(id: string, userId: string, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, Role.INSPECTOR) },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);

    if (building.status === BuildingStatus.APPROVED) {
      throw new BadRequestException('Building is already approved');
    }
    if (building.status === BuildingStatus.CERTIFIED) {
      throw new BadRequestException(
        'Building is already certified and cannot be re-approved',
      );
    }

    return this.prisma.building.update({
      where: { id },
      data: {
        status: BuildingStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });
  }

  // ── Building certificate ───────────────────────────────────────────────────

  async requestCertificateUpload(buildingId: string, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    if (
      building.status !== BuildingStatus.APPROVED &&
      building.status !== BuildingStatus.CERTIFIED
    ) {
      throw new BadRequestException(
        'Building must be approved by a photographer before a certificate can be uploaded',
      );
    }

    // Ensure there is an active survey to attach the certificate to
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });
    if (!activeSurvey) {
      throw new BadRequestException(
        'No active survey found for this building. Start a survey before uploading a certificate.',
      );
    }

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

    if (
      building.status !== BuildingStatus.APPROVED &&
      building.status !== BuildingStatus.CERTIFIED
    ) {
      throw new BadRequestException(
        'Building must be approved by a photographer before a certificate can be registered',
      );
    }

    // Find active survey — certificate is tied to the current survey
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      include: { buildingCertificate: { select: { id: true } } },
    });
    if (!activeSurvey) {
      throw new BadRequestException(
        'No active survey found for this building. Start a survey before registering a certificate.',
      );
    }

    const now = new Date();
    const [cert] = await this.prisma.$transaction([
      // Upsert based on surveyId so each survey has its own certificate record
      ...(activeSurvey.buildingCertificate
        ? [
            this.prisma.buildingCertificate.update({
              where: { surveyId: activeSurvey.id },
              data: {
                objectPathCertificate: dto.objectPath,
                uploadedById: adminId,
                uploadedAt: now,
              },
            }),
          ]
        : [
            this.prisma.buildingCertificate.create({
              data: {
                buildingId,
                surveyId: activeSurvey.id,
                objectPathCertificate: dto.objectPath,
                uploadedById: adminId,
              },
            }),
          ]),
      this.prisma.building.update({
        where: { id: buildingId },
        data: {
          status: BuildingStatus.CERTIFIED,
          certifiedAt: now,
          certifiedById: adminId,
        },
      }),
    ]);

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
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    // Find the active survey's certificate by default
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });

    const cert = activeSurvey
      ? await this.prisma.buildingCertificate.findUnique({
          where: { surveyId: activeSurvey.id },
        })
      : // Fallback: find any certificate linked to this building (legacy or completed surveys)
        await this.prisma.buildingCertificate.findFirst({
          where: { buildingId, building: { orgId } },
          orderBy: { uploadedAt: 'desc' },
        });

    if (!cert)
      throw new NotFoundException('No certificate found for this building');

    const { url, expiresAt } = await this.gcs.getSignedDownloadUrlWithExpiry({
      objectPath: cert.objectPathCertificate,
      responseDisposition: 'attachment; filename="certificate.pdf"',
    });
    return { signedUrl: url, expiresAt };
  }

  async deleteCertificate(buildingId: string, orgId: string): Promise<void> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    // Only allow deletion if the active survey is not yet completed
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });
    if (!activeSurvey) {
      throw new NotFoundException(
        'No active survey found — cannot delete a certificate from a completed survey',
      );
    }

    const cert = await this.prisma.buildingCertificate.findUnique({
      where: { surveyId: activeSurvey.id },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this building');

    await this.prisma.$transaction([
      this.prisma.buildingCertificate.delete({ where: { id: cert.id } }),
      this.prisma.building.update({
        where: { id: buildingId },
        data: {
          status: BuildingStatus.APPROVED,
          certifiedAt: null,
          certifiedById: null,
        },
      }),
    ]);
    await this.gcs.deleteObject(cert.objectPathCertificate);
  }

  // ── Certificate download for a specific historical survey ─────────────────

  async getCertificateDownloadUrlBySurvey(
    buildingId: string,
    surveyId: string,
    orgId: string,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, buildingId, orgId },
    });
    if (!survey) throw new NotFoundException(`Survey ${surveyId} not found`);

    const cert = await this.prisma.buildingCertificate.findUnique({
      where: { surveyId },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this survey');

    const { url, expiresAt } = await this.gcs.getSignedDownloadUrlWithExpiry({
      objectPath: cert.objectPathCertificate,
      responseDisposition: 'attachment; filename="certificate.pdf"',
    });
    return { signedUrl: url, expiresAt };
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

  // ── Guard: check if certificate operations are allowed on this building ───
  // Used by the controller to forbid cert operations on completed surveys

  async assertActiveSurveyExists(
    buildingId: string,
    orgId: string,
  ): Promise<void> {
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });
    if (!activeSurvey) {
      throw new ForbiddenException(
        'No active survey — all changes are locked. Start a new survey to continue.',
      );
    }
  }
}
