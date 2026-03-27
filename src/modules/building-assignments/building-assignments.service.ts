import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BuildingAssignment,
  BuildingAssignmentEvent,
  BuildingWorkflowState,
  Prisma,
} from '../../../generated/prisma/client';
import {
  BuildingAssignmentEventType,
  BuildingAssignmentStatus,
  BuildingWorkflowStatus,
  Role,
  SurveyExecutionStatus,
  SurveyStatus,
} from '../../../generated/prisma/enums';
import {
  paginate,
  type PaginatedResult,
} from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SurveysService } from '../surveys/surveys.service';
import { AssignBuildingDto } from './dto/assign-building.dto';
import { AssignBuildingsDto } from './dto/assign-buildings.dto';
import { AssignSiteBuildingsDto } from './dto/assign-site-buildings.dto';
import { AssignmentHistoryQueryDto } from './dto/assignment-history-query.dto';
import { ReassignBuildingDto } from './dto/reassign-building.dto';
import { RespondBuildingAssignmentDto } from './dto/respond-building-assignment.dto';

type AssignmentRecord = Prisma.BuildingAssignmentGetPayload<{
  include: {
    building: {
      include: {
        site: { select: { id: true; name: true } };
        workflowState: {
          include: {
            completedBy: {
              select: {
                id: true;
                email: true;
                firstName: true;
                lastName: true;
              };
            };
            reopenedBy: {
              select: {
                id: true;
                email: true;
                firstName: true;
                lastName: true;
              };
            };
          };
        };
        surveys: {
          where: { status: 'ACTIVE' };
          take: 1;
          include: {
            inspectorCompletedBy: {
              select: {
                id: true;
                email: true;
                firstName: true;
                lastName: true;
              };
            };
            reopenedBy: {
              select: {
                id: true;
                email: true;
                firstName: true;
                lastName: true;
              };
            };
          };
        };
      };
    };
    inspector: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
      };
    };
    assignedBy: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
      };
    };
    survey: {
      select: {
        id: true;
        version: true;
        status: true;
        executionStatus: true;
        scheduledStartAt: true;
        activatedAt: true;
      };
    };
    group: {
      include: {
        site: { select: { id: true; name: true } };
        _count: { select: { assignments: true } };
      };
    };
  };
}>;

type HistoryRecord = Prisma.BuildingAssignmentEventGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
      };
    };
    inspector: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
      };
    };
    building: {
      select: {
        id: true;
        name: true;
        site: { select: { id: true; name: true } };
      };
    };
    assignment: {
      select: {
        id: true;
        surveyId: true;
        status: true;
        assignedAt: true;
        respondedAt: true;
        accessEndedAt: true;
      };
    };
    survey: {
      select: {
        id: true;
        version: true;
        status: true;
        executionStatus: true;
        scheduledStartAt: true;
        activatedAt: true;
      };
    };
    group: {
      include: {
        site: { select: { id: true; name: true } };
        _count: { select: { assignments: true } };
      };
    };
  };
}>;

const ASSIGNMENT_INCLUDE = {
  building: {
    include: {
      site: { select: { id: true, name: true } },
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
    },
  },
  inspector: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  assignedBy: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  survey: {
    select: {
      id: true,
      version: true,
      status: true,
      executionStatus: true,
      scheduledStartAt: true,
      activatedAt: true,
    },
  },
  group: {
    include: {
      site: { select: { id: true, name: true } },
      _count: { select: { assignments: true } },
    },
  },
} satisfies Prisma.BuildingAssignmentInclude;

const HISTORY_INCLUDE = {
  actor: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  inspector: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  building: {
    select: {
      id: true,
      name: true,
      site: { select: { id: true, name: true } },
    },
  },
  assignment: {
    select: {
      id: true,
      surveyId: true,
      status: true,
      assignedAt: true,
      respondedAt: true,
      accessEndedAt: true,
    },
  },
  survey: {
    select: {
      id: true,
      version: true,
      status: true,
      executionStatus: true,
      scheduledStartAt: true,
      activatedAt: true,
    },
  },
  group: {
    include: {
      site: { select: { id: true, name: true } },
      _count: { select: { assignments: true } },
    },
  },
} satisfies Prisma.BuildingAssignmentEventInclude;

@Injectable()
export class BuildingAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveys: SurveysService,
    private readonly notifications: NotificationsService,
  ) {}

  async assignBuilding(
    dto: AssignBuildingDto,
    adminId: string,
    orgId: string,
  ) {
    const result = await this.assignBuildingsInternal(
      [dto.buildingId],
      dto.inspectorId,
      adminId,
      orgId,
      dto.adminNote,
      undefined,
      false,
      dto.surveyId,
    );

    return result.assignments[0];
  }

  async assignMany(
    dto: AssignBuildingsDto,
    adminId: string,
    orgId: string,
  ) {
    return this.assignBuildingsInternal(
      dto.buildingIds,
      dto.inspectorId,
      adminId,
      orgId,
      dto.adminNote,
      undefined,
      false,
      dto.surveyId,
    );
  }

  async assignSiteBuildings(
    siteId: string,
    dto: AssignSiteBuildingsDto,
    adminId: string,
    orgId: string,
  ) {
    await this.ensureSiteExists(siteId, orgId);

    const requestedIds = dto.buildingIds?.length
      ? Array.from(new Set(dto.buildingIds))
      : (
          await this.prisma.building.findMany({
            where: { orgId, siteId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        ).map((building) => building.id);

    if (requestedIds.length === 0) {
      throw new BadRequestException(
        'This site has no current buildings available for assignment',
      );
    }

    const buildings = await this.prisma.building.findMany({
      where: { orgId, id: { in: requestedIds } },
      select: { id: true, siteId: true },
    });

    if (buildings.length !== requestedIds.length) {
      throw new NotFoundException(
        'One or more selected buildings do not exist in this organisation',
      );
    }

    const invalid = buildings.find((building) => building.siteId !== siteId);
    if (invalid) {
      throw new BadRequestException(
        'All selected buildings must belong to the requested site',
      );
    }

    return this.assignBuildingsInternal(
      requestedIds,
      dto.inspectorId,
      adminId,
      orgId,
      dto.adminNote,
      siteId,
      true,
      dto.surveyId,
    );
  }

  async reassignBuilding(
    buildingId: string,
    dto: ReassignBuildingDto,
    adminId: string,
    orgId: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
      include: {
        site: { select: { id: true, name: true } },
      },
    });
    if (!building) {
      throw new NotFoundException(`Building ${buildingId} not found`);
    }

    await this.assertInspectorExists(dto.inspectorId, orgId);
    const targetSurvey = await this.resolveSurveyForAssignment(
      dto.surveyId,
      buildingId,
      orgId,
    );
    const targetSurveyId = targetSurvey?.id ?? null;

    const current = await this.prisma.buildingAssignment.findFirst({
      where: { buildingId, orgId, accessEndedAt: null, surveyId: targetSurveyId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { assignedAt: 'desc' },
    });

    if (!current) {
      return this.assignBuilding(
        {
          buildingId,
          inspectorId: dto.inspectorId,
          adminNote: dto.adminNote,
          surveyId: targetSurveyId ?? undefined,
        },
        adminId,
        orgId,
      );
    }

    if (current.inspectorId === dto.inspectorId) {
      throw new BadRequestException(
        'This building is already assigned to the selected photographer',
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.buildingAssignment.update({
        where: { id: current.id },
        data: {
          status: BuildingAssignmentStatus.REASSIGNED,
          accessEndedAt: now,
          endedById: adminId,
        },
      });

      await this.createEventTx(tx, {
        orgId,
        buildingId,
        surveyId: current.surveyId ?? undefined,
        assignmentId: current.id,
        groupId: current.groupId ?? undefined,
        inspectorId: current.inspectorId,
        actorId: adminId,
        type: BuildingAssignmentEventType.ACCESS_REMOVED,
        metadata: {
          reason: 'REASSIGNED',
          reassignedToInspectorId: dto.inspectorId,
        },
      });

      const nextAssignment = await tx.buildingAssignment.create({
        data: {
          orgId,
          buildingId,
          surveyId: targetSurveyId,
          inspectorId: dto.inspectorId,
          assignedById: adminId,
          adminNote: dto.adminNote,
          status: BuildingAssignmentStatus.PENDING,
        },
        include: ASSIGNMENT_INCLUDE,
      });

      await this.createEventTx(tx, {
        orgId,
        buildingId,
        surveyId: nextAssignment.surveyId ?? undefined,
        assignmentId: nextAssignment.id,
        inspectorId: dto.inspectorId,
        actorId: adminId,
        type: BuildingAssignmentEventType.REASSIGNED,
        metadata: {
          previousInspectorId: current.inspectorId,
        },
      });

      return nextAssignment;
    });

    return this.serializeAssignment(updated, false);
  }

  async respondToAssignment(
    assignmentId: string,
    dto: RespondBuildingAssignmentDto,
    inspectorId: string,
    orgId: string,
  ) {
    const assignment = await this.prisma.buildingAssignment.findFirst({
      where: {
        id: assignmentId,
        orgId,
        inspectorId,
        accessEndedAt: null,
      },
      include: ASSIGNMENT_INCLUDE,
    });

    if (!assignment) {
      throw new NotFoundException('Building assignment not found');
    }

    if (assignment.status !== BuildingAssignmentStatus.PENDING) {
      throw new ForbiddenException(
        'Only pending assignments can be accepted or rejected',
      );
    }

    if (dto.status === BuildingAssignmentStatus.ACCEPTED) {
      await this.assertAssignmentCanBeAccepted(assignment, orgId);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextAssignment = await tx.buildingAssignment.update({
        where: { id: assignment.id },
        data: {
          status: dto.status,
          inspectorNote: dto.inspectorNote,
          respondedAt: now,
          accessEndedAt:
            dto.status === BuildingAssignmentStatus.REJECTED ? now : null,
        },
        include: ASSIGNMENT_INCLUDE,
      });

      if (dto.status === BuildingAssignmentStatus.ACCEPTED) {
        await this.ensureWorkflowStateTx(tx, assignment.buildingId, orgId);
      }

      await this.createEventTx(tx, {
        orgId,
        buildingId: assignment.buildingId,
        surveyId: assignment.surveyId ?? undefined,
        assignmentId: assignment.id,
        groupId: assignment.groupId ?? undefined,
        inspectorId,
        actorId: inspectorId,
        type:
          dto.status === BuildingAssignmentStatus.ACCEPTED
            ? BuildingAssignmentEventType.ACCEPTED
            : BuildingAssignmentEventType.REJECTED,
        metadata: dto.inspectorNote
          ? { inspectorNote: dto.inspectorNote }
          : undefined,
      });

      return nextAssignment;
    });

    return this.serializeAssignment(updated, false);
  }

  async respondToGroup(
    groupId: string,
    dto: RespondBuildingAssignmentDto,
    inspectorId: string,
    orgId: string,
  ) {
    const assignments = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        groupId,
        inspectorId,
        accessEndedAt: null,
        status: BuildingAssignmentStatus.PENDING,
      },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { assignedAt: 'asc' },
    });

    if (assignments.length === 0) {
      throw new NotFoundException('No pending grouped assignments found');
    }

    if (dto.status === BuildingAssignmentStatus.ACCEPTED) {
      for (const assignment of assignments) {
        await this.assertAssignmentCanBeAccepted(assignment, orgId);
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx.buildingAssignment.update({
          where: { id: assignment.id },
          data: {
            status: dto.status,
            inspectorNote: dto.inspectorNote,
            respondedAt: now,
            accessEndedAt:
              dto.status === BuildingAssignmentStatus.REJECTED ? now : null,
          },
        });

        if (dto.status === BuildingAssignmentStatus.ACCEPTED) {
          await this.ensureWorkflowStateTx(tx, assignment.buildingId, orgId);
        }

        await this.createEventTx(tx, {
          orgId,
          buildingId: assignment.buildingId,
          surveyId: assignment.surveyId ?? undefined,
          assignmentId: assignment.id,
          groupId,
          inspectorId,
          actorId: inspectorId,
          type:
            dto.status === BuildingAssignmentStatus.ACCEPTED
              ? BuildingAssignmentEventType.ACCEPTED
              : BuildingAssignmentEventType.REJECTED,
          metadata: dto.inspectorNote
            ? { inspectorNote: dto.inspectorNote }
            : undefined,
        });
      }

      return tx.buildingAssignment.findMany({
        where: { id: { in: assignments.map((assignment) => assignment.id) } },
        include: ASSIGNMENT_INCLUDE,
        orderBy: { assignedAt: 'asc' },
      });
    });

    return {
      groupId,
      status: dto.status,
      assignments: updated.map((assignment) =>
        this.serializeAssignment(assignment, false),
      ),
    };
  }

  async listInspectorAssignments(inspectorId: string, orgId: string) {
    const assignments = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        inspectorId,
        accessEndedAt: null,
        status: {
          in: [
            BuildingAssignmentStatus.PENDING,
            BuildingAssignmentStatus.ACCEPTED,
          ],
        },
      },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
    });

    return {
      pending: assignments
        .filter((assignment) => assignment.status === BuildingAssignmentStatus.PENDING)
        .map((assignment) => this.serializeAssignment(assignment, false)),
      accepted: assignments
        .filter((assignment) => assignment.status === BuildingAssignmentStatus.ACCEPTED)
        .map((assignment) => this.serializeAssignment(assignment, true)),
    };
  }

  async listInspectorHistory(
    inspectorId: string,
    orgId: string,
    query: AssignmentHistoryQueryDto,
  ): Promise<PaginatedResult<ReturnType<typeof this.serializeHistoryEvent>>> {
    return this.listHistory(orgId, query, inspectorId);
  }

  async listAdminHistory(
    orgId: string,
    query: AssignmentHistoryQueryDto,
  ): Promise<PaginatedResult<ReturnType<typeof this.serializeHistoryEvent>>> {
    return this.listHistory(orgId, query, query.inspectorId);
  }

  async completeWorkflow(buildingId: string, inspectorId: string, orgId: string) {
    const result = await this.surveys.completeActiveFieldwork(
      buildingId,
      inspectorId,
      orgId,
    );
    return result.workflow;
  }

  async reopenWorkflow(buildingId: string, adminId: string, orgId: string) {
    const result = await this.surveys.reopenActiveFieldwork(
      buildingId,
      adminId,
      orgId,
    );
    return result.workflow;
  }

  async assertInspectorCanWorkOnBuilding(
    buildingId: string,
    inspectorId: string,
    orgId: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
      select: {
        id: true,
        surveys: {
          where: { status: SurveyStatus.ACTIVE },
          take: 1,
          select: {
            id: true,
            version: true,
            executionStatus: true,
          },
        },
      },
    });
    if (!building) {
      throw new NotFoundException(`Building ${buildingId} not found`);
    }

    const activeSurvey = building.surveys[0] ?? null;
    const currentAssignment = await this.findRuntimeAssignment(
      buildingId,
      inspectorId,
      orgId,
      activeSurvey?.id ?? null,
    );

    if (!currentAssignment) {
      const latestAssignment = await this.prisma.buildingAssignment.findFirst({
        where: { buildingId, orgId, inspectorId },
        orderBy: { assignedAt: 'desc' },
      });

      if (latestAssignment) {
        this.throwByAssignmentState(latestAssignment);
      }

      throw new NotFoundException(`Building ${buildingId} not found`);
    }

    if (currentAssignment.status !== BuildingAssignmentStatus.ACCEPTED) {
      this.throwByAssignmentState(currentAssignment);
    }

    if (
      activeSurvey &&
      activeSurvey.executionStatus === SurveyExecutionStatus.INSPECTOR_COMPLETED
    ) {
      throw new ForbiddenException(
        'This survey fieldwork is completed and must be reopened before further changes',
      );
    }

    return { assignment: currentAssignment, activeSurvey };
  }

  async assertInspectorCanWorkOnFloor(
    floorId: string,
    inspectorId: string,
    orgId: string,
  ) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, building: { orgId } },
      select: { id: true, buildingId: true },
    });
    if (!floor) {
      throw new NotFoundException(`Floor ${floorId} not found`);
    }

    await this.assertInspectorCanWorkOnBuilding(
      floor.buildingId,
      inspectorId,
      orgId,
    );

    return floor;
  }

  async assertInspectorCanWorkOnDoor(
    doorId: string,
    inspectorId: string,
    orgId: string,
  ) {
    const door = await this.prisma.door.findFirst({
      where: { id: doorId, floor: { building: { orgId } } },
      select: { id: true, floor: { select: { buildingId: true } } },
    });
    if (!door) {
      throw new NotFoundException(`Door ${doorId} not found`);
    }

    await this.assertInspectorCanWorkOnBuilding(
      door.floor.buildingId,
      inspectorId,
      orgId,
    );

    return door;
  }

  async getSiteAssignmentAdvisory(siteId: string, orgId: string) {
    const currentAssignments = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        accessEndedAt: null,
        building: { siteId },
      },
      include: {
        building: { select: { id: true, name: true } },
        inspector: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    if (currentAssignments.length === 0) {
      return null;
    }

    const inspectors = new Map<string, { id: string; name: string; email: string }>();
    for (const assignment of currentAssignments) {
      inspectors.set(assignment.inspector.id, {
        id: assignment.inspector.id,
        name: this.fullName(assignment.inspector),
        email: assignment.inspector.email,
      });
    }

    return {
      siteId,
      hasExistingAssignments: true,
      currentAssignments: currentAssignments.map((assignment) => ({
        buildingId: assignment.building.id,
        buildingName: assignment.building.name,
        inspectorId: assignment.inspector.id,
        inspectorName: this.fullName(assignment.inspector),
        status: assignment.status,
        assignedAt: assignment.assignedAt,
      })),
      suggestedInspectors: Array.from(inspectors.values()),
    };
  }

  async getCurrentAssignmentSummary(buildingId: string, orgId: string) {
    const assignment = await this.prisma.buildingAssignment.findFirst({
      where: { buildingId, orgId, accessEndedAt: null },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { assignedAt: 'desc' },
    });

    return assignment ? this.serializeAssignment(assignment, true) : null;
  }

  async getWorkflowSummary(buildingId: string, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
      include: {
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
      },
    });
    if (!building) {
      throw new NotFoundException(`Building ${buildingId} not found`);
    }

    return this.serializeWorkflow(
      building.surveys[0] ?? null,
      building.workflowState,
    );
  }

  async ensureWorkflowState(buildingId: string, orgId: string) {
    return this.prisma.buildingWorkflowState.upsert({
      where: { buildingId },
      update: {},
      create: {
        buildingId,
        orgId,
      },
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
    });
  }

  private async assignBuildingsInternal(
    buildingIds: string[],
    inspectorId: string,
    adminId: string,
    orgId: string,
    adminNote?: string,
    siteId?: string,
    forceSiteGroup = false,
    surveyId?: string,
  ) {
    const uniqueBuildingIds = Array.from(new Set(buildingIds));
    if (uniqueBuildingIds.length === 0) {
      throw new BadRequestException('At least one building must be selected');
    }

    if (surveyId && uniqueBuildingIds.length !== 1) {
      throw new BadRequestException(
        'Survey-linked assignment requires exactly one building in the request',
      );
    }

    await this.assertInspectorExists(inspectorId, orgId);
    if (siteId) {
      await this.ensureSiteExists(siteId, orgId);
    }

    const buildings = await this.prisma.building.findMany({
      where: { orgId, id: { in: uniqueBuildingIds } },
      select: {
        id: true,
        name: true,
        siteId: true,
      },
    });

    if (buildings.length !== uniqueBuildingIds.length) {
      throw new NotFoundException(
        'One or more selected buildings do not exist in this organisation',
      );
    }

    if (siteId) {
      const invalidBuilding = buildings.find((building) => building.siteId !== siteId);
      if (invalidBuilding) {
        throw new BadRequestException(
          'All selected buildings must belong to the same requested site',
        );
      }
    }

    let resolvedSurveyId: string | null = null;
    if (surveyId) {
      const resolvedSurvey = await this.resolveSurveyForAssignment(
        surveyId,
        uniqueBuildingIds[0],
        orgId,
      );
      resolvedSurveyId = resolvedSurvey?.id ?? null;
    }

    const conflictWhere: Prisma.BuildingAssignmentWhereInput = {
      orgId,
      buildingId: { in: uniqueBuildingIds },
      accessEndedAt: null,
      ...(resolvedSurveyId === null
        ? {}
        : {
            OR: [{ surveyId: resolvedSurveyId }, { surveyId: null }],
          }),
    };

    const openAssignments = await this.prisma.buildingAssignment.findMany({
      where: conflictWhere,
      include: {
        building: { select: { name: true } },
        inspector: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (openAssignments.length > 0) {
      const details = openAssignments
        .map(
          (assignment) =>
            `${assignment.building.name} -> ${this.fullName(assignment.inspector)}`,
        )
        .join(', ');

      throw new BadRequestException(
        `These buildings already have active assignment state and must be reassigned explicitly: ${details}`,
      );
    }

    const uniqueSiteIds = Array.from(
      new Set(buildings.map((building) => building.siteId).filter(Boolean)),
    );
    const shouldCreateGroup =
      uniqueBuildingIds.length > 1 &&
      (forceSiteGroup || uniqueSiteIds.length === 1);

    const created = await this.prisma.$transaction(async (tx) => {
      const group = shouldCreateGroup
        ? await tx.buildingAssignmentGroup.create({
            data: {
              orgId,
              siteId: siteId ?? (uniqueSiteIds[0] as string | undefined),
              createdById: adminId,
            },
          })
        : null;

      const assignments: AssignmentRecord[] = [];
      for (const buildingId of uniqueBuildingIds) {
        const assignment = await tx.buildingAssignment.create({
          data: {
            orgId,
            buildingId,
            surveyId: resolvedSurveyId,
            inspectorId,
            groupId: group?.id,
            assignedById: adminId,
            adminNote,
            status: BuildingAssignmentStatus.PENDING,
          },
          include: ASSIGNMENT_INCLUDE,
        });

        await this.createEventTx(tx, {
          orgId,
          buildingId,
          surveyId: assignment.surveyId ?? undefined,
          assignmentId: assignment.id,
          groupId: group?.id,
          inspectorId,
          actorId: adminId,
          type: BuildingAssignmentEventType.ASSIGNED,
          metadata: adminNote ? { adminNote } : undefined,
        });

        assignments.push(assignment);
      }

      return { group, assignments };
    });

    await this.notifyAssignmentInvitations(created.assignments);

    return {
      grouped: Boolean(created.group),
      group: created.group
        ? {
            id: created.group.id,
            siteId: created.group.siteId,
          }
        : null,
      assignments: created.assignments.map((assignment) =>
        this.serializeAssignment(assignment, false),
      ),
    };
  }

  private async listHistory(
    orgId: string,
    query: AssignmentHistoryQueryDto,
    inspectorId?: string,
  ): Promise<PaginatedResult<ReturnType<typeof this.serializeHistoryEvent>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.BuildingAssignmentEventWhereInput = {
      orgId,
      ...(inspectorId ? { inspectorId } : {}),
      ...(query.siteId ? { building: { site: { id: query.siteId } } } : {}),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...this.historyStateFilter(query.state),
    };

    const [total, events] = await Promise.all([
      this.prisma.buildingAssignmentEvent.count({ where }),
      this.prisma.buildingAssignmentEvent.findMany({
        where,
        include: HISTORY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return paginate(
      events.map((event) => this.serializeHistoryEvent(event)),
      total,
      page,
      limit,
    );
  }

  private historyStateFilter(state?: string): Prisma.BuildingAssignmentEventWhereInput {
    if (!state) return {};

    const normalized = state.toUpperCase();
    switch (normalized) {
      case 'PENDING':
        return {
          type: BuildingAssignmentEventType.ASSIGNED,
          assignment: { status: BuildingAssignmentStatus.PENDING },
        };
      case 'ASSIGNED':
        return { type: BuildingAssignmentEventType.ASSIGNED };
      case 'ACCEPTED':
        return { type: BuildingAssignmentEventType.ACCEPTED };
      case 'REJECTED':
        return { type: BuildingAssignmentEventType.REJECTED };
      case 'REMOVED':
      case 'ACCESS_REMOVED':
        return { type: BuildingAssignmentEventType.ACCESS_REMOVED };
      case 'REASSIGNED':
        return { type: BuildingAssignmentEventType.REASSIGNED };
      case 'COMPLETED':
      case 'BUILDING_COMPLETED':
        return { type: BuildingAssignmentEventType.BUILDING_COMPLETED };
      case 'REOPENED':
      case 'BUILDING_REOPENED':
        return { type: BuildingAssignmentEventType.BUILDING_REOPENED };
      default:
        return {};
    }
  }

  private async assertInspectorExists(inspectorId: string, orgId: string) {
    const inspector = await this.prisma.user.findFirst({
      where: { id: inspectorId, orgId, role: Role.INSPECTOR },
      select: { id: true },
    });
    if (!inspector) {
      throw new NotFoundException(`Inspector ${inspectorId} not found`);
    }
  }

  private async ensureSiteExists(siteId: string, orgId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, orgId },
      select: { id: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
  }

  private async resolveSurveyForAssignment(
    surveyId: string | undefined,
    buildingId: string,
    orgId: string,
  ) {
    if (!surveyId) {
      return null;
    }

    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, buildingId, orgId },
      select: { id: true, status: true, version: true },
    });
    if (!survey) {
      throw new NotFoundException(
        `Survey ${surveyId} not found for building ${buildingId}`,
      );
    }
    if (survey.status === SurveyStatus.COMPLETED) {
      throw new BadRequestException(
        `Survey v${survey.version} is completed and cannot accept new assignments`,
      );
    }

    return survey;
  }

  private async assertAssignmentCanBeAccepted(
    assignment: Pick<BuildingAssignment, 'id' | 'buildingId' | 'surveyId' | 'assignedAt'>,
    orgId: string,
  ) {
    const staleMessage =
      'This assignment is stale or expired and cannot be accepted. Ask an admin to reassign this survey.';

    if (assignment.surveyId) {
      const survey = await this.prisma.survey.findFirst({
        where: {
          id: assignment.surveyId,
          buildingId: assignment.buildingId,
          orgId,
        },
        select: { id: true, status: true },
      });

      if (!survey || survey.status === SurveyStatus.COMPLETED) {
        throw new BadRequestException(staleMessage);
      }

      return;
    }

    const activeSurvey = await this.prisma.survey.findFirst({
      where: {
        orgId,
        buildingId: assignment.buildingId,
        status: SurveyStatus.ACTIVE,
      },
      select: {
        activatedAt: true,
        startedAt: true,
        createdAt: true,
      },
    });

    if (!activeSurvey) {
      const surveyHistoryCount = await this.prisma.survey.count({
        where: {
          orgId,
          buildingId: assignment.buildingId,
        },
      });

      // Legacy flow allows acceptance before the first survey row exists.
      if (surveyHistoryCount === 0) {
        return;
      }

      throw new BadRequestException(staleMessage);
    }

    const cycleBoundary =
      activeSurvey.activatedAt ?? activeSurvey.startedAt ?? activeSurvey.createdAt;

    if (assignment.assignedAt < cycleBoundary) {
      throw new BadRequestException(staleMessage);
    }
  }

  private async ensureWorkflowStateTx(
    tx: Prisma.TransactionClient,
    buildingId: string,
    orgId: string,
  ) {
    await tx.buildingWorkflowState.upsert({
      where: { buildingId },
      update: {},
      create: {
        buildingId,
        orgId,
      },
    });
  }

  private async createEventTx(
    tx: Prisma.TransactionClient,
    params: {
      orgId: string;
      buildingId: string;
      surveyId?: string;
      assignmentId?: string;
      groupId?: string;
      inspectorId?: string;
      actorId: string;
      type: BuildingAssignmentEventType;
      metadata?: Prisma.JsonObject;
    },
  ) {
    await tx.buildingAssignmentEvent.create({
      data: {
        orgId: params.orgId,
        buildingId: params.buildingId,
        surveyId: params.surveyId,
        assignmentId: params.assignmentId,
        groupId: params.groupId,
        inspectorId: params.inspectorId,
        actorId: params.actorId,
        type: params.type,
        metadata: params.metadata,
      },
    });
  }

  private throwByAssignmentState(assignment: BuildingAssignment) {
    if (assignment.status === BuildingAssignmentStatus.PENDING) {
      throw new ForbiddenException(
        'This assignment is still pending acceptance and workflow access is locked',
      );
    }

    if (assignment.status === BuildingAssignmentStatus.REJECTED) {
      throw new ForbiddenException(
        'This assignment was rejected and no workflow access is available',
      );
    }

    if (
      assignment.status === BuildingAssignmentStatus.REASSIGNED ||
      assignment.status === BuildingAssignmentStatus.REMOVED ||
      assignment.accessEndedAt
    ) {
      throw new ForbiddenException(
        'Access to this building has been removed from your account',
      );
    }

    throw new ForbiddenException(
      'You do not have workflow access to this building',
    );
  }

  private serializeAssignment(assignment: AssignmentRecord, includeWorkflow: boolean) {
    const surveyContext = this.resolveAssignmentSurveyContext(assignment);

    return {
      id: assignment.id,
      surveyId: surveyContext.id,
      surveyVersion: surveyContext.version,
      surveyStatus: surveyContext.status,
      surveyExecutionStatus: surveyContext.executionStatus,
      scheduledStartAt: surveyContext.scheduledStartAt,
      activatedAt: surveyContext.activatedAt,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      respondedAt: assignment.respondedAt,
      accessEndedAt: assignment.accessEndedAt,
      adminNote: assignment.adminNote,
      inspectorNote: assignment.inspectorNote,
      building: {
        id: assignment.building.id,
        name: assignment.building.name,
        site: assignment.building.site,
      },
      inspector: {
        id: assignment.inspector.id,
        email: assignment.inspector.email,
        firstName: assignment.inspector.firstName,
        lastName: assignment.inspector.lastName,
        fullName: this.fullName(assignment.inspector),
      },
      assignedBy: {
        id: assignment.assignedBy.id,
        email: assignment.assignedBy.email,
        firstName: assignment.assignedBy.firstName,
        lastName: assignment.assignedBy.lastName,
        fullName: this.fullName(assignment.assignedBy),
      },
      group: assignment.group
        ? {
            id: assignment.group.id,
            grouped: assignment.group._count.assignments > 1,
            totalAssignments: assignment.group._count.assignments,
            site: assignment.group.site,
          }
        : null,
      workflow: includeWorkflow
        ? this.serializeWorkflow(
            assignment.building.surveys[0] ?? null,
            assignment.building.workflowState,
          )
        : null,
    };
  }

  private serializeHistoryEvent(event: HistoryRecord) {
    return {
      id: event.id,
      surveyId: event.surveyId ?? event.assignment?.surveyId ?? null,
      surveyVersion: event.survey?.version ?? null,
      surveyStatus: event.survey?.status ?? null,
      surveyExecutionStatus: event.survey?.executionStatus ?? null,
      scheduledStartAt: event.survey?.scheduledStartAt ?? null,
      activatedAt: event.survey?.activatedAt ?? null,
      type: event.type,
      timestamp: event.createdAt,
      actor: {
        id: event.actor.id,
        email: event.actor.email,
        firstName: event.actor.firstName,
        lastName: event.actor.lastName,
        fullName: this.fullName(event.actor),
      },
      inspector: event.inspector
        ? {
            id: event.inspector.id,
            email: event.inspector.email,
            firstName: event.inspector.firstName,
            lastName: event.inspector.lastName,
            fullName: this.fullName(event.inspector),
          }
        : null,
      building: {
        id: event.building.id,
        name: event.building.name,
      },
      site: event.building.site,
      assignment: event.assignment
        ? {
            id: event.assignment.id,
            status: event.assignment.status,
            assignedAt: event.assignment.assignedAt,
            respondedAt: event.assignment.respondedAt,
            accessEndedAt: event.assignment.accessEndedAt,
          }
        : null,
      group: event.group
        ? {
            id: event.group.id,
            grouped: event.group._count.assignments > 1,
            totalAssignments: event.group._count.assignments,
            site: event.group.site,
          }
        : null,
      metadata: event.metadata,
    };
  }

  private resolveAssignmentSurveyContext(assignment: AssignmentRecord) {
    const fallbackActiveSurvey =
      assignment.surveyId === null ? (assignment.building.surveys[0] ?? null) : null;
    const survey = assignment.survey ?? fallbackActiveSurvey;

    return {
      id: assignment.surveyId ?? survey?.id ?? null,
      version: survey?.version ?? null,
      status: survey?.status ?? null,
      executionStatus: survey?.executionStatus ?? null,
      scheduledStartAt: survey?.scheduledStartAt ?? null,
      activatedAt: survey?.activatedAt ?? null,
    };
  }

  private async notifyAssignmentInvitations(
    assignments: AssignmentRecord[],
  ): Promise<void> {
    for (const assignment of assignments) {
      if (!assignment.survey) {
        continue;
      }

      await this.notifications.notifyUsers([assignment.inspector.id], {
        title: 'New survey assignment invitation',
        body: `You have a new invitation for survey v${assignment.survey.version} at "${assignment.building.name}".`,
        data: {
          buildingId: assignment.building.id,
          surveyId: assignment.survey.id,
          surveyVersion: String(assignment.survey.version),
          type: 'BUILDING_ASSIGNMENT_INVITED',
        },
      });
    }
  }

  private async findRuntimeAssignment(
    buildingId: string,
    inspectorId: string,
    orgId: string,
    activeSurveyId?: string | null,
  ) {
    if (activeSurveyId) {
      const linked = await this.prisma.buildingAssignment.findFirst({
        where: {
          buildingId,
          orgId,
          inspectorId,
          accessEndedAt: null,
          surveyId: activeSurveyId,
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (linked) {
        return linked;
      }

      const fallback = await this.prisma.buildingAssignment.findFirst({
        where: {
          buildingId,
          orgId,
          inspectorId,
          accessEndedAt: null,
          surveyId: null,
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (fallback) {
        return fallback;
      }
    }

    return this.prisma.buildingAssignment.findFirst({
      where: {
        buildingId,
        orgId,
        inspectorId,
        accessEndedAt: null,
        surveyId: null,
      },
      orderBy: { assignedAt: 'desc' },
    });
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
      | (BuildingWorkflowState & {
          completedBy?: {
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
        })
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
        completedBy: activeSurvey.inspectorCompletedBy
          ? {
              id: activeSurvey.inspectorCompletedBy.id,
              email: activeSurvey.inspectorCompletedBy.email,
              firstName: activeSurvey.inspectorCompletedBy.firstName,
              lastName: activeSurvey.inspectorCompletedBy.lastName,
              fullName: this.fullName(activeSurvey.inspectorCompletedBy),
            }
          : null,
        reopenedAt: activeSurvey.reopenedAt ?? null,
        reopenedBy: activeSurvey.reopenedBy
          ? {
              id: activeSurvey.reopenedBy.id,
              email: activeSurvey.reopenedBy.email,
              firstName: activeSurvey.reopenedBy.firstName,
              lastName: activeSurvey.reopenedBy.lastName,
              fullName: this.fullName(activeSurvey.reopenedBy),
            }
          : null,
      };
    }

    const state = workflow ?? null;
    return {
      status: state?.status ?? BuildingWorkflowStatus.ACTIVE,
      completedAt: state?.completedAt ?? null,
      completedBy: state?.completedBy
        ? {
            id: state.completedBy.id,
            email: state.completedBy.email,
            firstName: state.completedBy.firstName,
            lastName: state.completedBy.lastName,
            fullName: this.fullName(state.completedBy),
          }
        : null,
      reopenedAt: state?.reopenedAt ?? null,
      reopenedBy: state?.reopenedBy
        ? {
            id: state.reopenedBy.id,
            email: state.reopenedBy.email,
            firstName: state.reopenedBy.firstName,
            lastName: state.reopenedBy.lastName,
            fullName: this.fullName(state.reopenedBy),
          }
        : null,
    };
  }

  private fullName(user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  }): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.email || 'Unknown User';
  }
}
