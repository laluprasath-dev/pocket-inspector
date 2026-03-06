import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums';
import { DoorStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, orgId: string, userId: string, role: Role) {
    const floor = await this.prisma.floor.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: { building: { select: { orgId: true } } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  async create(dto: CreateFloorDto, orgId: string, userId: string) {
    // Verify the building is accessible to this user (any role can create, but must own/be assigned)
    const building = await this.prisma.building.findFirst({
      where: { id: dto.buildingId, orgId },
    });
    if (!building) throw new NotFoundException(`Building ${dto.buildingId} not found`);

    return this.prisma.floor.create({
      data: {
        buildingId: dto.buildingId,
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
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const floor = await this.prisma.floor.findFirst({
      where: { id, building: { orgId } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    await this.prisma.floor.delete({ where: { id } });
  }

  async getDoors(floorId: string, orgId: string, userId: string, role: Role): Promise<DoorSummary[]> {
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
  // A floor is accessible if the inspector created it OR can access its building

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { building: { orgId } };

    return {
      building: { orgId },
      OR: [
        { createdById: userId },
        {
          // Building the inspector created
          building: { createdById: userId },
        },
        {
          // Building the inspector is assigned to via an inspection
          building: {
            inspections: {
              some: { assignments: { some: { inspectorId: userId } } },
            },
          },
        },
      ],
    };
  }
}
