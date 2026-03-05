import { Injectable, NotFoundException } from '@nestjs/common';
import { Site } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgId: string): Promise<Site[]> {
    return this.prisma.site.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId: string): Promise<Site> {
    const site = await this.prisma.site.findFirst({ where: { id, orgId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    return site;
  }

  create(dto: CreateSiteDto, orgId: string): Promise<Site> {
    return this.prisma.site.create({ data: { ...dto, orgId } });
  }

  async update(id: string, dto: UpdateSiteDto, orgId: string): Promise<Site> {
    await this.findById(id, orgId);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findById(id, orgId);
    await this.prisma.site.delete({ where: { id } });
  }
}
