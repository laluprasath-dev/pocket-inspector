import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  BuildingAssignmentEventType,
  BuildingAssignmentStatus,
  BuildingStatus,
  DoorStatus,
  Role,
  SurveyExecutionStatus,
  SurveyStatus,
} from '../../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmCompleteDto } from './dto/confirm-complete.dto';
import { CompleteFieldworkDto } from './dto/complete-fieldwork.dto';
import { ScheduleNextDto } from './dto/schedule-next.dto';
import { StartNextSurveyDto } from './dto/start-next-survey.dto';
import { SubmitSurveyDoorsDto } from './dto/submit-survey-doors.dto';

type FieldworkDoorSnapshot = {
  id: string;
  code: string;
  status: DoorStatus;
  imageCount: number;
  floorId: string;
  floorLabel: string | null;
};

type SerializedFieldworkDoor = {
  id: string;
  code: string;
  floorId: string;
  floorLabel: string | null;
  status: DoorStatus;
  imageCount: number;
};

type FieldworkReadiness = {
  totalDoors: number;
  certifiedDoors: SerializedFieldworkDoor[];
  submittedDoors: SerializedFieldworkDoor[];
  draftDoorsReadyToSubmit: SerializedFieldworkDoor[];
  draftDoorsMissingImages: SerializedFieldworkDoor[];
  canCompleteNow: boolean;
  canAutoSubmitAndComplete: boolean;
};

type BulkSubmitBlockedDoor = SerializedFieldworkDoor & {
  reason:
    | 'MISSING_IMAGES'
    | 'ALREADY_SUBMITTED'
    | 'ALREADY_CERTIFIED';
};

@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async cloneSurveyStructure(
    tx: Prisma.TransactionClient,
    buildingId: string,
    surveyId: string,
    adminId: string,
    sourceFloors: Array<{
      label: string | null;
      notes: string | null;
      doors: Array<{
        code: string;
        locationNotes: string | null;
      }>;
    }>,
  ) {
    for (const floor of sourceFloors) {
      const newFloor = await tx.floor.create({
        data: {
          buildingId,
          surveyId,
          label: floor.label,
          notes: floor.notes,
          createdById: adminId,
        },
      });

      for (const door of floor.doors) {
        await tx.door.create({
          data: {
            floorId: newFloor.id,
            code: door.code,
            locationNotes: door.locationNotes,
            status: DoorStatus.DRAFT,
            createdById: adminId,
          },
        });
      }
    }
  }

  private formatDoorCodes(doors: Array<{ code: string }>): string {
    const preview = doors.slice(0, 10).map((door) => door.code).join(', ');
    const remaining = doors.length - 10;
    return remaining > 0 ? `${preview} (+${remaining} more)` : preview;
  }

  private serializeFieldworkDoor(
    door: FieldworkDoorSnapshot,
  ): SerializedFieldworkDoor {
    return {
      id: door.id,
      code: door.code,
      floorId: door.floorId,
      floorLabel: door.floorLabel,
      status: door.status,
      imageCount: door.imageCount,
    };
  }

  private buildFieldworkReadiness(
    doors: FieldworkDoorSnapshot[],
  ): FieldworkReadiness {
    const certifiedDoors = doors
      .filter((door) => door.status === DoorStatus.CERTIFIED)
      .map((door) => this.serializeFieldworkDoor(door));
    const submittedDoors = doors
      .filter((door) => door.status === DoorStatus.SUBMITTED)
      .map((door) => this.serializeFieldworkDoor(door));
    const draftDoorsReadyToSubmit = doors
      .filter(
        (door) => door.status === DoorStatus.DRAFT && door.imageCount > 0,
      )
      .map((door) => this.serializeFieldworkDoor(door));
    const draftDoorsMissingImages = doors
      .filter(
        (door) => door.status === DoorStatus.DRAFT && door.imageCount === 0,
      )
      .map((door) => this.serializeFieldworkDoor(door));

    return {
      totalDoors: doors.length,
      certifiedDoors,
      submittedDoors,
      draftDoorsReadyToSubmit,
      draftDoorsMissingImages,
      canCompleteNow:
        doors.length > 0 &&
        draftDoorsReadyToSubmit.length === 0 &&
        draftDoorsMissingImages.length === 0,
      canAutoSubmitAndComplete:
        doors.length > 0 && draftDoorsMissingImages.length === 0,
    };
  }

  private assertFieldworkReadiness(
    readiness: FieldworkReadiness,
    options?: { allowAutoSubmitValidDoors?: boolean },
  ) {
    if (readiness.totalDoors === 0) {
      throw new BadRequestException(
        'At least one door must exist in the active survey before fieldwork can be completed',
      );
    }

    const allowAutoSubmit = options?.allowAutoSubmitValidDoors === true;
    if (allowAutoSubmit && readiness.draftDoorsMissingImages.length > 0) {
      throw new BadRequestException(
        `Cannot auto-submit and complete fieldwork because these doors have no images: ${this.formatDoorCodes(readiness.draftDoorsMissingImages)}`,
      );
    }

    const remainingDraftDoors = allowAutoSubmit
      ? readiness.draftDoorsMissingImages
      : [
          ...readiness.draftDoorsReadyToSubmit,
          ...readiness.draftDoorsMissingImages,
        ];

    if (remainingDraftDoors.length > 0) {
      throw new BadRequestException(
        `All doors must be submitted before completing fieldwork. Doors still in DRAFT: ${this.formatDoorCodes(remainingDraftDoors)}`,
      );
    }
  }

  private async listSurveyDoorsForFieldwork(
    db: Prisma.TransactionClient | PrismaService,
    surveyId: string,
    doorIds?: string[],
  ): Promise<FieldworkDoorSnapshot[]> {
    const doors = await db.door.findMany({
      where: {
        floor: { surveyId },
        ...(doorIds ? { id: { in: doorIds } } : {}),
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        status: true,
        floorId: true,
        floor: {
          select: {
            label: true,
          },
        },
        _count: {
          select: {
            images: true,
          },
        },
      },
    });

    return doors.map((door) => ({
      id: door.id,
      code: door.code,
      status: door.status,
      floorId: door.floorId,
      floorLabel: door.floor.label,
      imageCount: door._count.images,
    }));
  }

  async getFieldworkReadiness(
    buildingId: string,
    surveyId: string,
    inspectorId: string,
    orgId: string,
  ) {
    const survey = await this.requireSurveyForFieldwork(surveyId, buildingId, orgId);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active survey can have fieldwork readiness checked',
      );
    }

    const assignment = await this.findAcceptedRuntimeAssignment(
      buildingId,
      survey.id,
      orgId,
      inspectorId,
    );
    if (!assignment) {
      throw new ForbiddenException(
        'You do not have an accepted assignment for this active survey',
      );
    }

    const readiness = this.buildFieldworkReadiness(
      await this.listSurveyDoorsForFieldwork(this.prisma, survey.id),
    );

    return {
      surveyId: survey.id,
      buildingId: survey.buildingId,
      version: survey.version,
      status: survey.status,
      executionStatus: survey.executionStatus,
      summary: {
        totalDoors: readiness.totalDoors,
        certifiedDoors: readiness.certifiedDoors.length,
        submittedDoors: readiness.submittedDoors.length,
        draftDoorsReadyToSubmit: readiness.draftDoorsReadyToSubmit.length,
        draftDoorsMissingImages: readiness.draftDoorsMissingImages.length,
        canCompleteNow: readiness.canCompleteNow,
        canAutoSubmitAndComplete: readiness.canAutoSubmitAndComplete,
      },
      doors: {
        certified: readiness.certifiedDoors,
        submitted: readiness.submittedDoors,
        draftReadyToSubmit: readiness.draftDoorsReadyToSubmit,
        draftMissingImages: readiness.draftDoorsMissingImages,
      },
    };
  }

  async submitDoors(
    buildingId: string,
    surveyId: string,
    inspectorId: string,
    orgId: string,
    dto: SubmitSurveyDoorsDto,
  ) {
    const survey = await this.requireSurveyForFieldwork(surveyId, buildingId, orgId);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active survey can have doors submitted',
      );
    }
    if (survey.executionStatus === SurveyExecutionStatus.INSPECTOR_COMPLETED) {
      throw new BadRequestException(
        'This survey fieldwork has already been marked completed',
      );
    }

    const assignment = await this.findAcceptedRuntimeAssignment(
      buildingId,
      survey.id,
      orgId,
      inspectorId,
    );
    if (!assignment) {
      throw new ForbiddenException(
        'You do not have an accepted assignment for this active survey',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const selectedDoors = await this.listSurveyDoorsForFieldwork(
        tx,
        survey.id,
        dto.doorIds,
      );
      const foundDoorIds = new Set(selectedDoors.map((door) => door.id));
      const unknownDoorIds = dto.doorIds.filter((id) => !foundDoorIds.has(id));
      if (unknownDoorIds.length > 0) {
        throw new BadRequestException(
          `Some selected doors do not belong to this active survey: ${unknownDoorIds.join(', ')}`,
        );
      }

      const submittedDoors: SerializedFieldworkDoor[] = [];
      const blockedDoors: BulkSubmitBlockedDoor[] = [];

      for (const door of selectedDoors) {
        if (door.status === DoorStatus.SUBMITTED) {
          blockedDoors.push({
            ...this.serializeFieldworkDoor(door),
            reason: 'ALREADY_SUBMITTED',
          });
          continue;
        }
        if (door.status === DoorStatus.CERTIFIED) {
          blockedDoors.push({
            ...this.serializeFieldworkDoor(door),
            reason: 'ALREADY_CERTIFIED',
          });
          continue;
        }
        if (door.imageCount === 0) {
          blockedDoors.push({
            ...this.serializeFieldworkDoor(door),
            reason: 'MISSING_IMAGES',
          });
          continue;
        }

        submittedDoors.push({
          ...this.serializeFieldworkDoor(door),
          status: DoorStatus.SUBMITTED,
        });
      }

      if (submittedDoors.length > 0) {
        await tx.door.updateMany({
          where: {
            id: { in: submittedDoors.map((door) => door.id) },
            status: DoorStatus.DRAFT,
          },
          data: {
            status: DoorStatus.SUBMITTED,
            submittedAt: now,
            submittedById: inspectorId,
          },
        });
      }

      const readiness = this.buildFieldworkReadiness(
        await this.listSurveyDoorsForFieldwork(tx, survey.id),
      );

      return {
        surveyId: survey.id,
        buildingId: survey.buildingId,
        version: survey.version,
        executionStatus: survey.executionStatus,
        summary: {
          requestedDoors: dto.doorIds.length,
          submittedDoors: submittedDoors.length,
          blockedDoors: blockedDoors.length,
          canCompleteNow: readiness.canCompleteNow,
          canAutoSubmitAndComplete: readiness.canAutoSubmitAndComplete,
        },
        submittedDoors,
        blockedDoors,
        fieldworkReadiness: {
          totalDoors: readiness.totalDoors,
          certifiedDoors: readiness.certifiedDoors.length,
          submittedDoors: readiness.submittedDoors.length,
          draftDoorsReadyToSubmit: readiness.draftDoorsReadyToSubmit.length,
          draftDoorsMissingImages: readiness.draftDoorsMissingImages.length,
          canCompleteNow: readiness.canCompleteNow,
          canAutoSubmitAndComplete: readiness.canAutoSubmitAndComplete,
        },
      };
    });
  }

  // ── List survey history for a building ────────────────────────────────────

  async listByBuilding(
    buildingId: string,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    await this.assertBuildingAccess(buildingId, orgId, userId, role);

    const surveys = await this.prisma.survey.findMany({
      where: { buildingId, orgId },
      orderBy: { version: 'asc' },
      include: {
        confirmedBy: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        nextAssignedInspector: {
          select: { id: true, firstName: true, lastName: true },
        },
        buildingCertificate: { select: { id: true, uploadedAt: true } },
        _count: { select: { floors: true } },
      },
    });

    return surveys.map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      confirmedBy: s.confirmedBy,
      buildingCertificatePresent: s.buildingCertificate !== null,
      buildingCertificateUploadedAt: s.buildingCertificate?.uploadedAt ?? null,
      floorCount: s._count.floors,
      nextScheduledAt: s.nextScheduledAt,
      nextScheduledNote: s.nextScheduledNote,
      nextAssignedInspector: s.nextAssignedInspector,
    }));
  }

  // ── Get a single survey (for detail / history view) ───────────────────────

  async findById(
    surveyId: string,
    buildingId: string,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    await this.assertBuildingAccess(buildingId, orgId, userId, role);
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, buildingId, orgId },
      include: {
        confirmedBy: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        nextAssignedInspector: {
          select: { id: true, firstName: true, lastName: true },
        },
        buildingCertificate: { select: { id: true, uploadedAt: true } },
        floors: {
          orderBy: { label: 'asc' },
          include: {
            doors: {
              orderBy: { code: 'asc' },
              include: {
                _count: { select: { images: true } },
                certificate: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!survey)
      throw new NotFoundException(
        `Survey ${surveyId} not found for this building`,
      );

    return {
      id: survey.id,
      version: survey.version,
      status: survey.status,
      startedAt: survey.startedAt,
      completedAt: survey.completedAt,
      createdAt: survey.createdAt,
      createdBy: survey.createdBy,
      confirmedBy: survey.confirmedBy,
      buildingCertificatePresent: survey.buildingCertificate !== null,
      buildingCertificateUploadedAt:
        survey.buildingCertificate?.uploadedAt ?? null,
      nextScheduledAt: survey.nextScheduledAt,
      nextScheduledNote: survey.nextScheduledNote,
      nextAssignedInspector: survey.nextAssignedInspector,
      floors: survey.floors.map((floor) => ({
        id: floor.id,
        label: floor.label,
        notes: floor.notes,
        createdAt: floor.createdAt,
        doors: floor.doors.map((door) => ({
          id: door.id,
          code: door.code,
          locationNotes: door.locationNotes,
          status: door.status,
          submittedAt: door.submittedAt,
          certifiedAt: door.certifiedAt,
          imageCount: door._count.images,
          certificatePresent: door.certificate !== null,
          createdAt: door.createdAt,
        })),
      })),
    };
  }

  // ── Get the current active survey ─────────────────────────────────────────

  async findActive(
    buildingId: string,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    await this.assertBuildingAccess(buildingId, orgId, userId, role);

    const survey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        buildingCertificate: { select: { id: true, uploadedAt: true } },
        _count: { select: { floors: true } },
      },
    });
    if (!survey) {
      return null;
    }

    return {
      id: survey.id,
      version: survey.version,
      status: survey.status,
      startedAt: survey.startedAt,
      createdAt: survey.createdAt,
      createdBy: survey.createdBy,
      buildingCertificatePresent: survey.buildingCertificate !== null,
      buildingCertificateUploadedAt:
        survey.buildingCertificate?.uploadedAt ?? null,
      floorCount: survey._count.floors,
    };
  }

  async completeFieldwork(
    buildingId: string,
    surveyId: string,
    inspectorId: string,
    orgId: string,
    dto?: CompleteFieldworkDto,
  ) {
    const survey = await this.requireSurveyForFieldwork(surveyId, buildingId, orgId);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active survey can have fieldwork completed',
      );
    }
    if (survey.executionStatus === SurveyExecutionStatus.INSPECTOR_COMPLETED) {
      throw new BadRequestException(
        'This survey fieldwork has already been marked completed',
      );
    }

    const assignment = await this.findAcceptedRuntimeAssignment(
      buildingId,
      survey.id,
      orgId,
      inspectorId,
    );
    if (!assignment) {
      throw new ForbiddenException(
        'You do not have an accepted assignment for this active survey',
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const surveyDoors = await this.listSurveyDoorsForFieldwork(tx, survey.id);
      const readiness = this.buildFieldworkReadiness(surveyDoors);
      this.assertFieldworkReadiness(readiness, {
        allowAutoSubmitValidDoors: dto?.autoSubmitValidDoors,
      });

      if (
        dto?.autoSubmitValidDoors === true &&
        readiness.draftDoorsReadyToSubmit.length > 0
      ) {
        await tx.door.updateMany({
          where: {
            id: { in: readiness.draftDoorsReadyToSubmit.map((door) => door.id) },
            status: DoorStatus.DRAFT,
          },
          data: {
            status: DoorStatus.SUBMITTED,
            submittedAt: now,
            submittedById: inspectorId,
          },
        });
      }

      const building = await tx.building.findUnique({
        where: { id: buildingId },
        select: { status: true, approvedAt: true, approvedById: true },
      });

      const nextSurvey = await tx.survey.update({
        where: { id: survey.id },
        data: {
          executionStatus: SurveyExecutionStatus.INSPECTOR_COMPLETED,
          inspectorCompletedAt: now,
          inspectorCompletedById: inspectorId,
        },
        include: {
          inspectorCompletedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          reopenedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      if (building && building.status !== BuildingStatus.CERTIFIED) {
        await tx.building.update({
          where: { id: buildingId },
          data: {
            status: BuildingStatus.APPROVED,
            approvedAt: building.approvedAt ?? now,
            approvedById: building.approvedById ?? inspectorId,
          },
        });
      }

      await tx.buildingAssignmentEvent.create({
        data: {
          orgId,
          buildingId,
          surveyId: survey.id,
          assignmentId: assignment.id,
          groupId: assignment.groupId ?? undefined,
          inspectorId,
          actorId: inspectorId,
          type: BuildingAssignmentEventType.BUILDING_COMPLETED,
        },
      });

      return nextSurvey;
    });

    return this.serializeFieldwork(updated);
  }

  async reopenFieldwork(
    buildingId: string,
    surveyId: string,
    adminId: string,
    orgId: string,
  ) {
    const survey = await this.requireSurveyForFieldwork(surveyId, buildingId, orgId);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active survey can have fieldwork reopened',
      );
    }
    if (survey.executionStatus !== SurveyExecutionStatus.INSPECTOR_COMPLETED) {
      throw new BadRequestException(
        'Only survey fieldwork marked completed can be reopened',
      );
    }

    const buildingCertificate = await this.prisma.buildingCertificate.findUnique({
      where: { surveyId: survey.id },
      select: { id: true },
    });
    if (buildingCertificate) {
      throw new BadRequestException(
        'Delete the building certificate before reopening fieldwork',
      );
    }

    const assignment = await this.findAcceptedRuntimeAssignment(
      buildingId,
      survey.id,
      orgId,
    );

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const building = await tx.building.findUnique({
        where: { id: buildingId },
        select: { status: true },
      });

      const nextSurvey = await tx.survey.update({
        where: { id: survey.id },
        data: {
          executionStatus: SurveyExecutionStatus.IN_PROGRESS,
          reopenedAt: now,
          reopenedById: adminId,
        },
        include: {
          inspectorCompletedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          reopenedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      if (building?.status === BuildingStatus.APPROVED) {
        await tx.building.update({
          where: { id: buildingId },
          data: {
            status: BuildingStatus.DRAFT,
            approvedAt: null,
            approvedById: null,
          },
        });
      }

      await tx.buildingAssignmentEvent.create({
        data: {
          orgId,
          buildingId,
          surveyId: survey.id,
          assignmentId: assignment?.id,
          groupId: assignment?.groupId ?? undefined,
          inspectorId: assignment?.inspectorId,
          actorId: adminId,
          type: BuildingAssignmentEventType.BUILDING_REOPENED,
        },
      });

      return nextSurvey;
    });

    const inspectorIds = assignment?.inspectorId
      ? [assignment.inspectorId]
      : await this.getAcceptedInspectorIdsForSurveyNotification(
          buildingId,
          orgId,
          survey.id,
        );

    await this.notifications.notifyUsers(inspectorIds, {
      title: 'Survey fieldwork reopened',
      body: `Survey v${survey.version} has been reopened for continued fieldwork.`,
      data: {
        buildingId,
        surveyId: survey.id,
        surveyVersion: String(survey.version),
        type: 'SURVEY_FIELDWORK_REOPENED',
      },
    });

    return this.serializeFieldwork(updated);
  }

  async completeActiveFieldwork(
    buildingId: string,
    inspectorId: string,
    orgId: string,
  ) {
    const survey = await this.requireActiveSurvey(buildingId, orgId);
    return this.completeFieldwork(buildingId, survey.id, inspectorId, orgId);
  }

  async reopenActiveFieldwork(buildingId: string, adminId: string, orgId: string) {
    const survey = await this.requireActiveSurvey(buildingId, orgId);
    return this.reopenFieldwork(buildingId, survey.id, adminId, orgId);
  }

  async activateSurveyOnAcceptance(
    tx: Prisma.TransactionClient,
    params: {
      buildingId: string;
      surveyId: string;
      orgId: string;
      activatedById: string;
    },
  ) {
    return this.activatePlannedSurveyTx(tx, params);
  }

  private async activatePlannedSurveyTx(
    tx: Prisma.TransactionClient,
    params: {
      buildingId: string;
      surveyId: string;
      orgId: string;
      activatedById: string;
    },
  ) {
    const survey = await tx.survey.findFirst({
      where: {
        id: params.surveyId,
        buildingId: params.buildingId,
        orgId: params.orgId,
      },
      select: {
        id: true,
        version: true,
        status: true,
        scheduledStartAt: true,
      },
    });
    if (!survey) {
      throw new NotFoundException(
        `Survey ${params.surveyId} not found for this building`,
      );
    }

    if (survey.status !== SurveyStatus.PLANNED) {
      throw new BadRequestException('Only planned surveys can be activated');
    }

    const activeSurvey = await tx.survey.findFirst({
      where: {
        buildingId: params.buildingId,
        orgId: params.orgId,
        status: SurveyStatus.ACTIVE,
        NOT: { id: survey.id },
      },
      select: { id: true, version: true },
    });
    if (activeSurvey) {
      throw new BadRequestException(
        `A survey (v${activeSurvey.version}) is already active for this building`,
      );
    }

    const now = new Date();
    const updated = await tx.survey.update({
      where: { id: survey.id },
      data: {
        status: SurveyStatus.ACTIVE,
        activatedAt: now,
        activatedById: params.activatedById,
        startedAt: now,
        executionStatus: SurveyExecutionStatus.IN_PROGRESS,
        inspectorCompletedAt: null,
        inspectorCompletedById: null,
        reopenedAt: null,
        reopenedById: null,
      },
    });

    await tx.building.update({
      where: { id: params.buildingId },
      data: {
        status: BuildingStatus.DRAFT,
        approvedAt: null,
        approvedById: null,
        certifiedAt: null,
        certifiedById: null,
      },
    });

    return updated;
  }

  // ── Confirm survey complete ────────────────────────────────────────────────

  async confirmComplete(
    buildingId: string,
    dto: ConfirmCompleteDto,
    adminId: string,
    orgId: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    if (building.status !== BuildingStatus.CERTIFIED) {
      throw new BadRequestException(
        'The building certificate must be uploaded before a survey can be confirmed complete',
      );
    }

    const survey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      include: {
        floors: {
          include: {
            doors: {
              select: {
                id: true,
                status: true,
                code: true,
                locationNotes: true,
              },
            },
          },
        },
        buildingCertificate: { select: { id: true } },
        building: { select: { name: true } },
      },
    });
    if (!survey)
      throw new NotFoundException('No active survey found for this building');

    if (survey.executionStatus !== SurveyExecutionStatus.INSPECTOR_COMPLETED) {
      throw new BadRequestException(
        'Photographer fieldwork must be completed before confirming survey completion',
      );
    }

    if (!survey.buildingCertificate) {
      throw new BadRequestException(
        'A building certificate must be uploaded and registered before confirming completion',
      );
    }

    const allDoors = survey.floors.flatMap((floor) => floor.doors);
    if (allDoors.length === 0) {
      throw new BadRequestException(
        'At least one door must exist in the active survey before confirming completion',
      );
    }

    // Validate all doors are CERTIFIED
    const nonCertifiedDoors = allDoors.filter(
      (door) => door.status !== DoorStatus.CERTIFIED,
    );
    if (nonCertifiedDoors.length > 0) {
      throw new BadRequestException(
        `All doors must be CERTIFIED before confirming survey completion. Doors not yet certified: ${this.formatDoorCodes(nonCertifiedDoors)}`,
      );
    }

    const hasSchedulingInput =
      dto.nextScheduledAt !== undefined ||
      dto.nextScheduledNote !== undefined ||
      dto.nextAssignedInspectorId !== undefined;

    const now = new Date();
    const nextAssignedInspectorId = dto.nextAssignedInspectorId ?? null;

    const completionResult = await this.prisma.$transaction(async (tx) => {
      if (hasSchedulingInput) {
        const existingPlanned = await tx.survey.findFirst({
          where: { buildingId, orgId, status: SurveyStatus.PLANNED },
          select: { id: true },
        });
        if (existingPlanned) {
          throw new BadRequestException(
            'A planned survey already exists for this building. Activate or remove it before scheduling another one.',
          );
        }
      }

      const completedSurvey = await tx.survey.update({
        where: { id: survey.id },
        data: {
          status: SurveyStatus.COMPLETED,
          completedAt: now,
          confirmedById: adminId,
          nextScheduledAt: hasSchedulingInput ? dto.nextScheduledAt ?? null : null,
          nextScheduledNote: hasSchedulingInput
            ? dto.nextScheduledNote ?? null
            : null,
          nextAssignedInspectorId: hasSchedulingInput
            ? nextAssignedInspectorId
            : null,
        },
      });

      const assignmentsToClose = await tx.buildingAssignment.findMany({
        where: {
          orgId,
          buildingId,
          accessEndedAt: null,
          OR: [
            { surveyId: survey.id },
            {
              surveyId: null,
              status: {
                in: [
                  BuildingAssignmentStatus.PENDING,
                  BuildingAssignmentStatus.ACCEPTED,
                ],
              },
            },
          ],
        },
        select: {
          id: true,
          surveyId: true,
          groupId: true,
          inspectorId: true,
        },
      });

      if (assignmentsToClose.length > 0) {
        await tx.buildingAssignment.updateMany({
          where: { id: { in: assignmentsToClose.map((assignment) => assignment.id) } },
          data: {
            status: BuildingAssignmentStatus.REMOVED,
            accessEndedAt: now,
            endedById: adminId,
          },
        });

        for (const assignment of assignmentsToClose) {
          await tx.buildingAssignmentEvent.create({
            data: {
              orgId,
              buildingId,
              surveyId: assignment.surveyId ?? survey.id,
              assignmentId: assignment.id,
              groupId: assignment.groupId ?? undefined,
              inspectorId: assignment.inspectorId ?? undefined,
              actorId: adminId,
              type: BuildingAssignmentEventType.ACCESS_REMOVED,
              metadata: {
                reason: 'SURVEY_COMPLETED',
                completedSurveyId: survey.id,
              },
            },
          });
        }
      }

      let plannedSurvey: {
        id: string;
        version: number;
        status: SurveyStatus;
        scheduledStartAt: Date | null;
        nextScheduledAt: Date | null;
        nextScheduledNote: string | null;
        nextAssignedInspectorId: string | null;
      } | null = null;

      if (hasSchedulingInput) {
        const latestSurvey = await tx.survey.findFirst({
          where: { buildingId, orgId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latestSurvey?.version ?? survey.version) + 1;

        plannedSurvey = await tx.survey.create({
          data: {
            orgId,
            buildingId,
            version: nextVersion,
            status: SurveyStatus.PLANNED,
            executionStatus: SurveyExecutionStatus.IN_PROGRESS,
            createdById: adminId,
            scheduledStartAt: dto.nextScheduledAt ?? null,
            nextScheduledAt: dto.nextScheduledAt ?? null,
            nextScheduledNote: dto.nextScheduledNote ?? null,
            nextAssignedInspectorId,
          },
          select: {
            id: true,
            version: true,
            status: true,
            scheduledStartAt: true,
            nextScheduledAt: true,
            nextScheduledNote: true,
            nextAssignedInspectorId: true,
          },
        });

        await this.cloneSurveyStructure(
          tx,
          buildingId,
          plannedSurvey.id,
          adminId,
          survey.floors.map((floor) => ({
            label: floor.label,
            notes: floor.notes,
            doors: floor.doors.map((door) => ({
              code: door.code,
              locationNotes: door.locationNotes,
            })),
          })),
        );

        await tx.building.update({
          where: { id: buildingId },
          data: {
            status: BuildingStatus.DRAFT,
            approvedAt: null,
            approvedById: null,
            certifiedAt: null,
            certifiedById: null,
          },
        });
      }

      return {
        completedSurvey,
        plannedSurvey,
        completedInspectorIds: Array.from(
          new Set(
            assignmentsToClose
              .map((assignment) => assignment.inspectorId)
              .filter((inspectorId): inspectorId is string => Boolean(inspectorId)),
          ),
        ),
      };
    });

    await this.notifications.notifyUsers(completionResult.completedInspectorIds, {
      title: 'Survey completed',
      body: `Survey v${completionResult.completedSurvey.version} for "${survey.building.name}" has been confirmed complete.`,
      data: {
        buildingId,
        surveyId: survey.id,
        surveyVersion: String(completionResult.completedSurvey.version),
        type: 'SURVEY_COMPLETED',
      },
    });

    // Keep this notification conservative: planned survey exists but no assignment is created here.
    if (
      completionResult.plannedSurvey &&
      nextAssignedInspectorId &&
      dto.nextScheduledAt
    ) {
      const scheduledDate = dto.nextScheduledAt.toISOString().split('T')[0];
      await this.notifications.notifyUsers([nextAssignedInspectorId], {
        title: 'Next survey scheduled',
        body: `You have been scheduled for the next survey of "${survey.building.name}" on ${scheduledDate}.`,
        data: {
          buildingId,
          surveyId: completionResult.plannedSurvey.id,
          surveyVersion: String(completionResult.plannedSurvey.version),
          type: 'NEXT_SURVEY_SCHEDULED',
        },
      });
    }

    return {
      id: completionResult.completedSurvey.id,
      version: completionResult.completedSurvey.version,
      status: completionResult.completedSurvey.status,
      completedAt: completionResult.completedSurvey.completedAt,
      confirmedById: completionResult.completedSurvey.confirmedById,
      nextScheduledAt: completionResult.completedSurvey.nextScheduledAt,
      nextScheduledNote: completionResult.completedSurvey.nextScheduledNote,
      nextAssignedInspectorId: completionResult.completedSurvey.nextAssignedInspectorId,
      plannedNextSurvey: completionResult.plannedSurvey,
    };
  }

  // ── Start the next survey ─────────────────────────────────────────────────

  async startNext(
    buildingId: string,
    dto: StartNextSurveyDto,
    adminId: string,
    orgId: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);

    // Ensure there is no already-active survey
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });
    if (activeSurvey) {
      throw new BadRequestException(
        `A survey (v${activeSurvey.version}) is already active for this building. Complete it before starting a new one.`,
      );
    }

    const existingPlanned = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.PLANNED },
      select: { id: true, version: true },
    });
    if (existingPlanned) {
      throw new BadRequestException(
        `A planned survey (v${existingPlanned.version}) already exists for this building.`,
      );
    }

    // Get the last completed survey to clone structure from
    const lastSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.COMPLETED },
      orderBy: { version: 'desc' },
      include: {
        floors: {
          include: {
            doors: {
              select: {
                code: true,
                locationNotes: true,
              },
            },
          },
        },
      },
    });

    if (!lastSurvey) {
      throw new BadRequestException(
        'No completed survey found to clone from. Complete the current survey first.',
      );
    }

    const latestSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestSurvey?.version ?? lastSurvey.version) + 1;
    const nextAssignedInspectorId =
      dto.nextAssignedInspectorId ?? dto.assignedInspectorId ?? null;

    // Create new survey + clone floors/doors in a single transaction
    const newSurvey = await this.prisma.$transaction(async (tx) => {
      // 1. Create the new survey
      const survey = await tx.survey.create({
        data: {
          orgId,
          buildingId,
          version: nextVersion,
          status: SurveyStatus.PLANNED,
          executionStatus: SurveyExecutionStatus.IN_PROGRESS,
          createdById: adminId,
          scheduledStartAt: dto.nextScheduledAt ?? null,
          nextScheduledAt: dto.nextScheduledAt ?? null,
          nextScheduledNote: dto.nextScheduledNote ?? null,
          nextAssignedInspectorId,
        },
      });

      await this.cloneSurveyStructure(
        tx,
        buildingId,
        survey.id,
        adminId,
        lastSurvey.floors.map((floor) => ({
          label: floor.label,
          notes: floor.notes,
          doors: floor.doors.map((door) => ({
            code: door.code,
            locationNotes: door.locationNotes,
          })),
        })),
      );

      await tx.building.update({
        where: { id: buildingId },
        data: {
          status: BuildingStatus.DRAFT,
          approvedAt: null,
          approvedById: null,
          certifiedAt: null,
          certifiedById: null,
        },
      });

      return survey;
    });

    // Count what was cloned
    const floorCount = lastSurvey.floors.length;
    const doorCount = lastSurvey.floors.reduce(
      (sum, f) => sum + f.doors.length,
      0,
    );

    return {
      id: newSurvey.id,
      version: newSurvey.version,
      status: newSurvey.status,
      scheduledStartAt: newSurvey.scheduledStartAt,
      nextScheduledAt: newSurvey.nextScheduledAt,
      nextScheduledNote: newSurvey.nextScheduledNote,
      nextAssignedInspectorId: newSurvey.nextAssignedInspectorId,
      startedAt: newSurvey.startedAt,
      clonedFromVersion: lastSurvey.version,
      floorsCloned: floorCount,
      doorsCloned: doorCount,
    };
  }

  // ── Update scheduling for current active survey ───────────────────────────

  async scheduleNext(
    buildingId: string,
    dto: ScheduleNextDto,
    adminId: string,
    orgId: string,
  ) {
    await this.assertBuildingAccess(buildingId, orgId, adminId, Role.ADMIN);

    const survey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      include: {
        building: { select: { name: true } },
      },
    });
    if (!survey)
      throw new NotFoundException('No active survey found for this building');

    const updated = await this.prisma.survey.update({
      where: { id: survey.id },
      data: {
        nextScheduledAt: dto.nextScheduledAt ?? null,
        nextScheduledNote: dto.nextScheduledNote ?? null,
        nextAssignedInspectorId: dto.nextAssignedInspectorId ?? null,
      },
    });

    // Notify the assigned inspector
    if (dto.nextAssignedInspectorId) {
      const scheduledDate = dto.nextScheduledAt
        ? dto.nextScheduledAt.toISOString().split('T')[0]
        : 'a future date';
      await this.notifications.notifyUsers([dto.nextAssignedInspectorId], {
        title: 'Survey scheduled',
        body: `You have been scheduled for the next survey of "${survey.building.name}" on ${scheduledDate}.`,
        data: {
          buildingId,
          surveyId: survey.id,
          type: 'NEXT_SURVEY_SCHEDULED',
        },
      });
    }

    void adminId; // used for audit trail in future iterations
    return updated;
  }

  // ── Guard: check if a floor belongs to an active survey ──────────────────

  async assertFloorEditable(floorId: string): Promise<void> {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      include: { survey: { select: { status: true, version: true } } },
    });
    if (!floor) return; // not found — let the caller handle

    if (floor.survey && floor.survey.status !== SurveyStatus.ACTIVE) {
      throw new ForbiddenException(
        `Survey v${floor.survey.version} is ${floor.survey.status.toLowerCase()} and locked. No changes are allowed.`,
      );
    }
  }

  // ── Guard: check if a door belongs to an active survey ───────────────────

  async assertDoorEditable(doorId: string): Promise<void> {
    const door = await this.prisma.door.findUnique({
      where: { id: doorId },
      include: {
        floor: {
          include: {
            survey: { select: { status: true, version: true } },
          },
        },
      },
    });
    if (!door) return;

    if (door.floor.survey && door.floor.survey.status !== SurveyStatus.ACTIVE) {
      throw new ForbiddenException(
        `Survey v${door.floor.survey.version} is ${door.floor.survey.status.toLowerCase()} and locked. No changes are allowed.`,
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertBuildingAccess(
    buildingId: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<void> {
    const where =
      role === Role.ADMIN
        ? { id: buildingId, orgId }
        : {
            id: buildingId,
            orgId,
            assignments: {
              some: {
                inspectorId: userId,
                status: BuildingAssignmentStatus.ACCEPTED,
                accessEndedAt: null,
              },
            },
          };

    const building = await this.prisma.building.findFirst({ where });
    if (!building)
      throw new NotFoundException(`Building ${buildingId} not found`);
  }

  private async requireActiveSurvey(buildingId: string, orgId: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      select: { id: true },
    });
    if (!survey) {
      throw new NotFoundException('No active survey found for this building');
    }
    return survey;
  }

  private async requireSurveyForFieldwork(
    surveyId: string,
    buildingId: string,
    orgId: string,
  ) {
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, buildingId, orgId },
      select: {
        id: true,
        buildingId: true,
        version: true,
        status: true,
        executionStatus: true,
      },
    });
    if (!survey) {
      throw new NotFoundException(
        `Survey ${surveyId} not found for this building`,
      );
    }
    return survey;
  }

  private async findAcceptedRuntimeAssignment(
    buildingId: string,
    surveyId: string,
    orgId: string,
    inspectorId?: string,
  ) {
    const baseWhere = {
      buildingId,
      orgId,
      accessEndedAt: null,
      status: BuildingAssignmentStatus.ACCEPTED,
      ...(inspectorId ? { inspectorId } : {}),
    };

    const linkedAssignment = await this.prisma.buildingAssignment.findFirst({
      where: { ...baseWhere, surveyId },
      select: { id: true, groupId: true, inspectorId: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (linkedAssignment) {
      return linkedAssignment;
    }

    return this.prisma.buildingAssignment.findFirst({
      where: { ...baseWhere, surveyId: null },
      select: { id: true, groupId: true, inspectorId: true },
      orderBy: { assignedAt: 'desc' },
    });
  }

  private async getAcceptedInspectorIdsForSurveyNotification(
    buildingId: string,
    orgId: string,
    surveyId: string,
  ): Promise<string[]> {
    const assignments = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        buildingId,
        status: BuildingAssignmentStatus.ACCEPTED,
        accessEndedAt: null,
        OR: [{ surveyId }, { surveyId: null }],
      },
      select: { inspectorId: true },
    });

    return Array.from(new Set(assignments.map((assignment) => assignment.inspectorId)));
  }

  private serializeFieldwork(survey: {
    id: string;
    buildingId: string;
    version: number;
    status: SurveyStatus;
    executionStatus: SurveyExecutionStatus;
    inspectorCompletedAt: Date | null;
    reopenedAt: Date | null;
    inspectorCompletedBy?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
    reopenedBy?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }) {
    const completedBy = this.serializeWorkflowUser(survey.inspectorCompletedBy);
    const reopenedBy = this.serializeWorkflowUser(survey.reopenedBy);

    return {
      id: survey.id,
      buildingId: survey.buildingId,
      version: survey.version,
      status: survey.status,
      executionStatus: survey.executionStatus,
      inspectorCompletedAt: survey.inspectorCompletedAt,
      inspectorCompletedBy: completedBy,
      reopenedAt: survey.reopenedAt,
      reopenedBy,
      workflow: {
        status:
          survey.executionStatus === SurveyExecutionStatus.INSPECTOR_COMPLETED
            ? 'COMPLETED'
            : 'ACTIVE',
        completedAt: survey.inspectorCompletedAt,
        completedBy,
        reopenedAt: survey.reopenedAt,
        reopenedBy,
      },
    };
  }

  private serializeWorkflowUser(
    user:
      | {
          id: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
        }
      | null
      | undefined,
  ) {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email,
    };
  }
}
