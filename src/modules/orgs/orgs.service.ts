import { Injectable, NotFoundException } from '@nestjs/common';
import { Org } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOrgDto } from './dto/update-org.dto';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Org> {
    const org = await this.prisma.org.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organisation ${id} not found`);
    return org;
  }

  async update(id: string, dto: UpdateOrgDto): Promise<Org> {
    await this.findById(id);
    return this.prisma.org.update({ where: { id }, data: dto });
  }
}
