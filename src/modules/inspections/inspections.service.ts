import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InspectionStatus,
  InspectionType,
  Role,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { RespondAssignmentDto } from './dto/respond-assignment.dto';

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return this.prisma.inspection.findMany({
        where: { orgId },
        include: {
          site: { select: { id: true, name: true } },
          building: { select: { id: true, name: true } },
          _count: { select: { assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.inspection.findMany({
      where: {
        orgId,
        assignments: { some: { inspectorId: userId } },
      },
      include: {
        site: { select: { id: true, name: true } },
        building: { select: { id: true, name: true } },
        assignments: {
          where: { inspectorId: userId },
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, orgId },
      include: {
        site: { select: { id: true, name: true } },
        building: { select: { id: true, name: true } },
        assignments: {
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
        createdBy: { select: { id: true, email: true } },
      },
    });
    if (!inspection) throw new NotFoundException(`Survey ${id} not found`);
    return inspection;
  }

  async create(dto: CreateInspectionDto, orgId: string, createdById: string) {
    if (dto.type === InspectionType.SITE && !dto.siteId) {
      throw new BadRequestException('siteId is required for SITE surveys');
    }
    if (dto.type === InspectionType.BUILDING && !dto.buildingId) {
      throw new BadRequestException(
        'buildingId is required for BUILDING surveys',
      );
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, orgId },
      });
      if (!site) throw new NotFoundException(`Site ${dto.siteId} not found`);
    }
    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, orgId },
      });
      if (!building)
        throw new NotFoundException(`Building ${dto.buildingId} not found`);
    }

    return this.prisma.inspection.create({
      data: { orgId, createdById, ...dto },
    });
  }

  async archive(id: string, orgId: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, orgId },
    });
    if (!inspection) throw new NotFoundException(`Survey ${id} not found`);

    return this.prisma.inspection.update({
      where: { id },
      data: { status: InspectionStatus.ARCHIVED },
    });
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  async createAssignment(
    inspectionId: string,
    dto: CreateAssignmentDto,
    orgId: string,
  ) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, orgId },
    });
    if (!inspection)
      throw new NotFoundException(`Survey ${inspectionId} not found`);

    const inspector = await this.prisma.user.findFirst({
      where: { id: dto.inspectorId, orgId, role: Role.INSPECTOR },
    });
    if (!inspector)
      throw new NotFoundException(`Photographer ${dto.inspectorId} not found`);

    const existing = await this.prisma.inspectionAssignment.findUnique({
      where: {
        inspectionId_inspectorId: {
          inspectionId,
          inspectorId: dto.inspectorId,
        },
      },
    });
    if (existing) throw new BadRequestException('Photographer already assigned');

    return this.prisma.inspectionAssignment.create({
      data: {
        inspectionId,
        inspectorId: dto.inspectorId,
        adminNote: dto.adminNote,
      },
    });
  }

  async respondAssignment(
    inspectionId: string,
    dto: RespondAssignmentDto,
    inspectorId: string,
    orgId: string,
  ) {
    const assignment = await this.prisma.inspectionAssignment.findFirst({
      where: { inspectionId, inspectorId, inspection: { orgId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (assignment.status !== 'PENDING') {
      throw new ForbiddenException('Assignment has already been responded to');
    }

    return this.prisma.inspectionAssignment.update({
      where: { id: assignment.id },
      data: {
        status: dto.status,
        inspectorNote: dto.inspectorNote,
        respondedAt: new Date(),
      },
    });
  }
}
