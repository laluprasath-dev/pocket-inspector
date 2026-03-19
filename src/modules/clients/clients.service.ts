import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Client } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string, orgId: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id, orgId },
      include: {
        sites: { select: { id: true, name: true } },
        buildings: { select: { id: true, name: true } },
      },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  async create(
    dto: CreateClientDto,
    orgId: string,
    userId: string,
  ): Promise<Client> {
    const existing = await this.prisma.client.findUnique({
      where: { orgId_name: { orgId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(
        `A client named "${dto.name}" already exists`,
      );
    }

    return this.prisma.client.create({
      data: { ...dto, orgId, createdById: userId },
    });
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    orgId: string,
  ): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id, orgId },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);

    if (dto.name && dto.name !== client.name) {
      const duplicate = await this.prisma.client.findUnique({
        where: { orgId_name: { orgId, name: dto.name } },
      });
      if (duplicate) {
        throw new ConflictException(
          `A client named "${dto.name}" already exists`,
        );
      }
    }

    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id, orgId },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);

    await this.prisma.client.delete({ where: { id } });
  }
}
