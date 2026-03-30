import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Building, Floor } from '../../../generated/prisma/client';
import {
  BuildingAssignmentStatus,
  BuildingStatus,
  BuildingWorkflowStatus,
  DoorStatus,
  Role,
  SurveyExecutionStatus,
  SurveyStatus,
} from '../../../generated/prisma/enums';
import { BuildingAssignmentsService } from '../building-assignments/building-assignments.service';
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
    private readonly buildingAssignments: BuildingAssignmentsService,
  ) {}

  private formatDoorCodes(doors: Array<{ code: string }>): string {
    const preview = doors.slice(0, 10).map((door) => door.code).join(', ');
    const remaining = doors.length - 10;
    return remaining > 0 ? `${preview} (+${remaining} more)` : preview;
  }

  private async assertActiveSurveyReadyForBuildingCertificate(
    surveyId: string,
    operationLabel: string,
  ) {
    const doors = await this.prisma.door.findMany({
      where: { floor: { surveyId } },
      select: { code: true, status: true },
    });

    if (doors.length === 0) {
      throw new BadRequestException(
        `At least one door must exist in the active survey before ${operationLabel}`,
      );
    }

    const nonCertifiedDoors = doors.filter(
      (door) => door.status !== DoorStatus.CERTIFIED,
    );
    if (nonCertifiedDoors.length > 0) {
      throw new BadRequestException(
        `All doors must be certified before ${operationLabel}. Doors not yet certified: ${this.formatDoorCodes(nonCertifiedDoors)}`,
      );
    }
  }

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
        client: { select: { id: true, name: true } },
        assignments: {
          where: { accessEndedAt: null },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          include: {
            inspector: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        surveys: {
          where: { status: SurveyStatus.ACTIVE },
          take: 1,
          include: {
            inspectorCompletedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            reopenedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        workflowState: {
          include: {
            completedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            reopenedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    return buildings.map((b) => {
      const noOfFloors = b._count.floors;
      const noOfDoors = b.floors.reduce((sum, f) => sum + f._count.doors, 0);
      const currentAssignment = b.assignments[0] ?? null;
      const activeSurvey = b.surveys[0] ?? null;
      const { _count, floors, assignments, surveys, workflowState, ...rest } = b;
      void surveys;
      return {
        ...rest,
        noOfFloors,
        noOfDoors,
        currentAssignment: currentAssignment
          ? {
              id: currentAssignment.id,
              status: currentAssignment.status,
              assignedAt: currentAssignment.assignedAt,
              respondedAt: currentAssignment.respondedAt,
              inspector: {
                id: currentAssignment.inspector.id,
                email: currentAssignment.inspector.email,
                firstName: currentAssignment.inspector.firstName,
                lastName: currentAssignment.inspector.lastName,
              },
            }
          : null,
        workflowExecution: this.serializeWorkflow(activeSurvey, workflowState),
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
        client: { select: { id: true, name: true } },
        surveys: {
          where: { status: SurveyStatus.ACTIVE },
          include: {
            buildingCertificate: { select: { id: true, uploadedAt: true } },
            inspectorCompletedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            reopenedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          take: 1,
        },
        assignments: {
          where: { accessEndedAt: null },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          include: {
            inspector: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        workflowState: {
          include: {
            completedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            reopenedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);

    const activeSurvey = building.surveys[0] ?? null;
    const currentAssignment = building.assignments[0] ?? null;
    const noOfFloors = building._count.floors;
    const noOfDoors = building.floors.reduce(
      (sum, f) => sum + f._count.doors,
      0,
    );

    return {
      id: building.id,
      orgId: building.orgId,
      siteId: building.siteId,
      clientId: building.clientId,
      client: building.client,
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
      currentAssignment: currentAssignment
        ? {
            id: currentAssignment.id,
            status: currentAssignment.status,
            assignedAt: currentAssignment.assignedAt,
            respondedAt: currentAssignment.respondedAt,
            inspector: {
              id: currentAssignment.inspector.id,
              email: currentAssignment.inspector.email,
              firstName: currentAssignment.inspector.firstName,
              lastName: currentAssignment.inspector.lastName,
            },
          }
        : null,
      workflowExecution: this.serializeWorkflow(
        activeSurvey,
        building.workflowState,
      ),
    };
  }

  async create(
    dto: CreateBuildingDto,
    orgId: string,
    userId: string,
  ): Promise<Building | Record<string, unknown>> {
    if (dto.clientId && dto.siteId) {
      throw new BadRequestException(
        'A building linked to a site cannot have a direct client assignment. Assign the client to the site instead.',
      );
    }
    if (dto.clientId) {
      await this.assertClientExists(dto.clientId, orgId);
    }
    const building = await this.prisma.$transaction(async (tx) => {
      const created = await tx.building.create({
        data: { ...dto, orgId, createdById: userId },
      });
      await tx.buildingWorkflowState.create({
        data: {
          orgId,
          buildingId: created.id,
        },
      });
      return created;
    });

    const assignmentAdvisory = dto.siteId
      ? await this.buildingAssignments.getSiteAssignmentAdvisory(dto.siteId, orgId)
      : null;

    return assignmentAdvisory ? { ...building, assignmentAdvisory } : building;
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

    if (
      dto.clientId !== undefined &&
      dto.clientId !== null &&
      building.siteId
    ) {
      throw new BadRequestException(
        'A building linked to a site cannot have a direct client assignment. Assign the client to the site instead.',
      );
    }
    if (dto.clientId && dto.clientId !== null) {
      await this.assertClientExists(dto.clientId, orgId);
    }

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
        'Building fieldwork must be completed before a certificate can be uploaded',
      );
    }

    // Ensure there is an active survey to attach the certificate to
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      select: { id: true, executionStatus: true },
    });
    if (!activeSurvey) {
      throw new BadRequestException(
        'No active survey found for this building. Start a survey before uploading a certificate.',
      );
    }
    if (
      activeSurvey.executionStatus !== SurveyExecutionStatus.INSPECTOR_COMPLETED
    ) {
      throw new BadRequestException(
        'Photographer fieldwork must be completed before requesting a building certificate upload',
      );
    }
    await this.assertActiveSurveyReadyForBuildingCertificate(
      activeSurvey.id,
      'requesting a building certificate upload',
    );

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
        'Building fieldwork must be completed before a certificate can be registered',
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
    if (
      activeSurvey.executionStatus !== SurveyExecutionStatus.INSPECTOR_COMPLETED
    ) {
      throw new BadRequestException(
        'Photographer fieldwork must be completed before registering a building certificate',
      );
    }
    await this.assertActiveSurveyReadyForBuildingCertificate(
      activeSurvey.id,
      'registering a building certificate',
    );

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

    const inspectorIds = await this.getInspectorIdsForBuilding(
      buildingId,
      orgId,
      activeSurvey.id,
    );
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
    userId: string,
    role: Role,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    await this.findById(buildingId, orgId, userId, role);

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
    userId: string,
    role: Role,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    await this.findById(buildingId, orgId, userId, role);

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
  // INSPECTOR: only buildings with an accepted active building assignment

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { orgId };

    return {
      orgId,
      assignments: {
        some: {
          inspectorId: userId,
          status: BuildingAssignmentStatus.ACCEPTED,
          accessEndedAt: null,
        },
      },
    };
  }

  private async assertClientExists(
    clientId: string,
    orgId: string,
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, orgId },
    });
    if (!client) {
      throw new BadRequestException(`Client ${clientId} not found`);
    }
  }

  private async getInspectorIdsForBuilding(
    buildingId: string,
    orgId: string,
    activeSurveyId: string,
  ): Promise<string[]> {
    const scopedRecipients = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        buildingId,
        surveyId: activeSurveyId,
        status: BuildingAssignmentStatus.ACCEPTED,
        accessEndedAt: null,
      },
      select: { inspectorId: true },
    });

    if (scopedRecipients.length > 0) {
      return Array.from(
        new Set(scopedRecipients.map((assignment) => assignment.inspectorId)),
      );
    }

    const legacyRecipients = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        buildingId,
        surveyId: null,
        status: BuildingAssignmentStatus.ACCEPTED,
        accessEndedAt: null,
      },
      select: { inspectorId: true },
    });

    return Array.from(
      new Set(legacyRecipients.map((assignment) => assignment.inspectorId)),
    );
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

  private serializeWorkflow(
    activeSurvey:
      | {
          executionStatus: SurveyExecutionStatus;
          inspectorCompletedAt: Date | null;
          reopenedAt: Date | null;
          inspectorCompletedBy?:
            | {
                id: string;
                email: string;
                firstName: string | null;
                lastName: string | null;
              }
            | null;
          reopenedBy?:
            | {
                id: string;
                email: string;
                firstName: string | null;
                lastName: string | null;
              }
            | null;
        }
      | null
      | undefined,
    workflow:
      | {
          status: string;
          completedAt: Date | null;
          reopenedAt: Date | null;
          completedBy?:
            | {
                id: string;
                email: string;
                firstName: string | null;
                lastName: string | null;
              }
            | null;
          reopenedBy?:
            | {
                id: string;
                email: string;
                firstName: string | null;
                lastName: string | null;
              }
            | null;
        }
      | null
      | undefined,
  ) {
    if (activeSurvey) {
      return {
        status:
          activeSurvey.executionStatus ===
          SurveyExecutionStatus.INSPECTOR_COMPLETED
            ? BuildingWorkflowStatus.COMPLETED
            : BuildingWorkflowStatus.ACTIVE,
        completedAt: activeSurvey.inspectorCompletedAt ?? null,
        completedBy: activeSurvey.inspectorCompletedBy ?? null,
        reopenedAt: activeSurvey.reopenedAt ?? null,
        reopenedBy: activeSurvey.reopenedBy ?? null,
      };
    }

    return {
      status: workflow?.status ?? BuildingWorkflowStatus.ACTIVE,
      completedAt: workflow?.completedAt ?? null,
      completedBy: workflow?.completedBy ?? null,
      reopenedAt: workflow?.reopenedAt ?? null,
      reopenedBy: workflow?.reopenedBy ?? null,
    };
  }
}
