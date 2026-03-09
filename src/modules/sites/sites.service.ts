import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums';
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
    });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    return site;
  }

  create(dto: CreateSiteDto, orgId: string, userId: string): Promise<Site> {
    return this.prisma.site.create({
      data: { ...dto, orgId, createdById: userId },
    });
  }

  async update(id: string, dto: UpdateSiteDto, orgId: string): Promise<Site> {
    await this.prisma.site.findFirst({ where: { id, orgId } }).then((s) => {
      if (!s) throw new NotFoundException(`Site ${id} not found`);
    });
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const site = await this.prisma.site.findFirst({ where: { id, orgId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    await this.prisma.site.delete({ where: { id } });
  }

  // ── Access filter ─────────────────────────────────────────────────────────
  // ADMIN: all sites in the org
  // INSPECTOR: sites they created OR are assigned to (directly or via building)

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { orgId };

    return {
      orgId,
      OR: [
        { createdById: userId },
        {
          // Assigned via a direct site-level inspection
          inspections: {
            some: { assignments: { some: { inspectorId: userId } } },
          },
        },
        {
          // Assigned via a building-level inspection in this site
          buildings: {
            some: {
              inspections: {
                some: { assignments: { some: { inspectorId: userId } } },
              },
            },
          },
        },
      ],
    };
  }
}
