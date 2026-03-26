import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BuildingAssignmentStatus,
  Role,
} from '../../../generated/prisma/enums';
import { Site } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgId: string, userId: string, role: Role): Promise<Site[]> {
    return this.prisma.site.findMany({
      where: this.accessFilter(orgId, userId, role),
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async findById(
    id: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<Site> {
    const site = await this.prisma.site.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: { client: { select: { id: true, name: true } } },
    });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    return site;
  }

  async create(
    dto: CreateSiteDto,
    orgId: string,
    userId: string,
  ): Promise<Site> {
    if (dto.clientId) {
      await this.assertClientExists(dto.clientId, orgId);
    }
    return this.prisma.site.create({
      data: { ...dto, orgId, createdById: userId },
    });
  }

  async update(id: string, dto: UpdateSiteDto, orgId: string): Promise<Site> {
    await this.prisma.site.findFirst({ where: { id, orgId } }).then((s) => {
      if (!s) throw new NotFoundException(`Site ${id} not found`);
    });
    if (dto.clientId) {
      await this.assertClientExists(dto.clientId, orgId);
    }
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const site = await this.prisma.site.findFirst({ where: { id, orgId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    await this.prisma.site.delete({ where: { id } });
  }

  // ── Access filter ─────────────────────────────────────────────────────────
  // ADMIN: all sites in the org
  // INSPECTOR: only sites that currently contain an accepted active building assignment

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

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { orgId };

    return {
      orgId,
      buildings: {
        some: {
          assignments: {
            some: {
              inspectorId: userId,
              status: BuildingAssignmentStatus.ACCEPTED,
              accessEndedAt: null,
            },
          },
        },
      },
    };
  }
}
