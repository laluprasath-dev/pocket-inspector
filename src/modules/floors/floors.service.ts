import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findById(id: string, orgId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id, building: { orgId } },
      include: { building: { select: { orgId: true } } },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  async create(dto: CreateFloorDto, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: dto.buildingId, orgId },
    });
    if (!building)
      throw new NotFoundException(`Building ${dto.buildingId} not found`);

    return this.prisma.floor.create({
      data: {
        buildingId: dto.buildingId,
        label: dto.label,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateFloorDto, orgId: string) {
    await this.findById(id, orgId);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findById(id, orgId);
    await this.prisma.floor.delete({ where: { id } });
  }

  async getDoors(floorId: string, orgId: string): Promise<DoorSummary[]> {
    await this.findById(floorId, orgId);

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
}
