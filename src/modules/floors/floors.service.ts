import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BuildingAssignmentStatus,
  Role,
  SurveyStatus,
} from '../../../generated/prisma/enums';
import { DoorStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { BuildingAssignmentsService } from '../building-assignments/building-assignments.service';
import { SurveysService } from '../surveys/surveys.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';

export interface DoorSummary {
  id: string;
  code: string;
  locationNotes: string | null;
  status: DoorStatus;
  imagesCount: number;
  certificatePresent: boolean;
  createdAt: Date;
}

@Injectable()
export class FloorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveys: SurveysService,
    private readonly buildingAssignments: BuildingAssignmentsService,
  ) {}

  async findById(id: string, orgId: string, userId: string, role: Role) {
    const floor = await this.prisma.floor.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: { building: { select: { orgId: true } } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  async create(
    dto: CreateFloorDto,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: dto.buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${dto.buildingId} not found`);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnBuilding(
        dto.buildingId,
        userId,
        orgId,
      );
    }

    // Find or auto-create a survey for this building
    let activeSurvey = await this.prisma.survey.findFirst({
      where: { buildingId: dto.buildingId, orgId, status: SurveyStatus.ACTIVE },
    });

    if (!activeSurvey) {
      // Check if any survey has ever existed for this building
      const surveyCount = await this.prisma.survey.count({
        where: { buildingId: dto.buildingId },
      });

      if (surveyCount === 0) {
        // Brand-new building — auto-create Survey v1
        activeSurvey = await this.prisma.survey.create({
          data: {
            orgId,
            buildingId: dto.buildingId,
            version: 1,
            status: SurveyStatus.ACTIVE,
            createdById: userId,
          },
        });
      } else {
        // Surveys exist but none is active — admin must call start-next
        throw new BadRequestException(
          'No active survey found for this building. Use "Start Next Survey" to begin a new survey cycle.',
        );
      }
    }

    return this.prisma.floor.create({
      data: {
        buildingId: dto.buildingId,
        surveyId: activeSurvey.id,
        label: dto.label,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateFloorDto, orgId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id, building: { orgId } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);

    // Guard: cannot modify floors in a completed survey
    await this.surveys.assertFloorEditable(id);

    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const floor = await this.prisma.floor.findFirst({
      where: { id, building: { orgId } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);

    // Guard: cannot delete floors in a completed survey
    await this.surveys.assertFloorEditable(id);

    await this.prisma.floor.delete({ where: { id } });
  }

  async getDoors(
    floorId: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<DoorSummary[]> {
    await this.findById(floorId, orgId, userId, role);

    const doors = await this.prisma.door.findMany({
      where: { floorId },
      include: {
        _count: { select: { images: true } },
        certificate: { select: { id: true } },
      },
      orderBy: { code: 'asc' },
    });

    return doors.map((door) => ({
      id: door.id,
      code: door.code,
      locationNotes: door.locationNotes,
      status: door.status,
      imagesCount: door._count.images,
      certificatePresent: door.certificate !== null,
      createdAt: door.createdAt,
    }));
  }

  // ── Access filter ─────────────────────────────────────────────────────────

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { building: { orgId } };

    return {
      OR: [
        {
          survey: { status: SurveyStatus.ACTIVE },
          building: {
            orgId,
            assignments: {
              some: {
                inspectorId: userId,
                status: BuildingAssignmentStatus.ACCEPTED,
                accessEndedAt: null,
                survey: { status: SurveyStatus.ACTIVE },
              },
            },
          },
        },
        {
          survey: { status: SurveyStatus.ACTIVE },
          building: {
            orgId,
            assignments: {
              some: {
                inspectorId: userId,
                status: BuildingAssignmentStatus.ACCEPTED,
                accessEndedAt: null,
                surveyId: null,
              },
            },
          },
        },
        {
          surveyId: null,
          building: {
            orgId,
            surveys: { none: {} },
            assignments: {
              some: {
                inspectorId: userId,
                status: BuildingAssignmentStatus.ACCEPTED,
                accessEndedAt: null,
                surveyId: null,
              },
            },
          },
        },
      ],
    };
  }
}
