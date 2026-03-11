import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuildingStatus, DoorStatus, Role, SurveyStatus } from '../../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmCompleteDto } from './dto/confirm-complete.dto';
import { ScheduleNextDto } from './dto/schedule-next.dto';
import { StartNextSurveyDto } from './dto/start-next-survey.dto';

@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── List survey history for a building ────────────────────────────────────

  async listByBuilding(buildingId: string, orgId: string, userId: string, role: Role) {
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

  async findById(surveyId: string, buildingId: string, orgId: string, userId: string, role: Role) {
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
      throw new NotFoundException(`Survey ${surveyId} not found for this building`);

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

  async findActive(buildingId: string, orgId: string, userId: string, role: Role) {
    await this.assertBuildingAccess(buildingId, orgId, userId, role);

    const survey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        buildingCertificate: { select: { id: true, uploadedAt: true } },
        _count: { select: { floors: true } },
      },
    });
    if (!survey)
      throw new NotFoundException('No active survey found for this building');

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
    if (!building) throw new NotFoundException(`Building ${buildingId} not found`);

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
            doors: { select: { id: true, status: true, code: true } },
          },
        },
        buildingCertificate: { select: { id: true } },
      },
    });
    if (!survey)
      throw new NotFoundException('No active survey found for this building');

    if (!survey.buildingCertificate) {
      throw new BadRequestException(
        'A building certificate must be uploaded and registered before confirming completion',
      );
    }

    // Validate all doors are CERTIFIED
    const nonCertifiedDoors = survey.floors.flatMap((f) =>
      f.doors.filter((d) => d.status !== DoorStatus.CERTIFIED),
    );
    if (nonCertifiedDoors.length > 0) {
      const codes = nonCertifiedDoors.map((d) => d.code).join(', ');
      throw new BadRequestException(
        `All doors must be CERTIFIED before confirming survey completion. Doors not yet certified: ${codes}`,
      );
    }

    const now = new Date();
    const completedSurvey = await this.prisma.survey.update({
      where: { id: survey.id },
      data: {
        status: SurveyStatus.COMPLETED,
        completedAt: now,
        confirmedById: adminId,
        nextScheduledAt: dto.nextScheduledAt ?? null,
        nextScheduledNote: dto.nextScheduledNote ?? null,
        nextAssignedInspectorId: dto.nextAssignedInspectorId ?? null,
      },
      include: {
        building: { select: { name: true } },
      },
    });

    // Notify all assigned inspectors that the survey is complete
    const inspectorIds = await this.getInspectorIdsForBuilding(buildingId);
    await this.notifications.notifyUsers(inspectorIds, {
      title: 'Survey completed',
      body: `Survey v${completedSurvey.version} for "${completedSurvey.building.name}" has been confirmed complete.`,
      data: {
        buildingId,
        surveyId: survey.id,
        surveyVersion: String(completedSurvey.version),
        type: 'SURVEY_COMPLETED',
      },
    });

    // Notify the scheduled next inspector if provided
    if (dto.nextAssignedInspectorId && dto.nextScheduledAt) {
      const scheduledDate = dto.nextScheduledAt.toISOString().split('T')[0];
      await this.notifications.notifyUsers([dto.nextAssignedInspectorId], {
        title: 'Next survey scheduled',
        body: `You have been scheduled for the next survey of "${completedSurvey.building.name}" on ${scheduledDate}.`,
        data: {
          buildingId,
          surveyId: survey.id,
          type: 'NEXT_SURVEY_SCHEDULED',
        },
      });
    }

    return {
      id: completedSurvey.id,
      version: completedSurvey.version,
      status: completedSurvey.status,
      completedAt: completedSurvey.completedAt,
      confirmedById: completedSurvey.confirmedById,
      nextScheduledAt: completedSurvey.nextScheduledAt,
      nextScheduledNote: completedSurvey.nextScheduledNote,
      nextAssignedInspectorId: completedSurvey.nextAssignedInspectorId,
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
    if (!building) throw new NotFoundException(`Building ${buildingId} not found`);

    // Ensure there is no already-active survey
    const activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId, orgId, status: SurveyStatus.ACTIVE },
    });
    if (activeSurvey) {
      throw new BadRequestException(
        `A survey (v${activeSurvey.version}) is already active for this building. Complete it before starting a new one.`,
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
                createdById: true,
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

    const nextVersion = lastSurvey.version + 1;

    // Create new survey + clone floors/doors in a single transaction
    const newSurvey = await this.prisma.$transaction(async (tx) => {
      // 1. Create the new survey
      const survey = await tx.survey.create({
        data: {
          orgId,
          buildingId,
          version: nextVersion,
          status: SurveyStatus.ACTIVE,
          startedAt: new Date(),
          createdById: adminId,
        },
      });

      // 2. Clone floors and their doors
      for (const floor of lastSurvey.floors) {
        const newFloor = await tx.floor.create({
          data: {
            buildingId,
            surveyId: survey.id,
            label: floor.label,
            notes: floor.notes,
            createdById: adminId,
          },
        });

        // Clone doors under the new floor (no images, no certs, reset status)
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

      // 3. Reset building status to DRAFT for the new survey cycle
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

    // Notify assigned inspector if provided
    if (dto.assignedInspectorId) {
      await this.notifications.notifyUsers([dto.assignedInspectorId], {
        title: 'New survey started',
        body: `Survey v${nextVersion} has been started for "${building.name}". You have been assigned.`,
        data: {
          buildingId,
          surveyId: newSurvey.id,
          surveyVersion: String(nextVersion),
          type: 'NEW_SURVEY_STARTED',
        },
      });
    }

    return {
      id: newSurvey.id,
      version: newSurvey.version,
      status: newSurvey.status,
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

    if (
      floor.survey &&
      floor.survey.status === SurveyStatus.COMPLETED
    ) {
      throw new ForbiddenException(
        `Survey v${floor.survey.version} is completed and locked. No changes are allowed.`,
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

    if (
      door.floor.survey &&
      door.floor.survey.status === SurveyStatus.COMPLETED
    ) {
      throw new ForbiddenException(
        `Survey v${door.floor.survey.version} is completed and locked. No changes are allowed.`,
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
            OR: [
              { createdById: userId },
              {
                inspections: {
                  some: { assignments: { some: { inspectorId: userId } } },
                },
              },
            ],
          };

    const building = await this.prisma.building.findFirst({ where });
    if (!building) throw new NotFoundException(`Building ${buildingId} not found`);
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
