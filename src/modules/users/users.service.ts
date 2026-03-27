import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { User } from '../../../generated/prisma/client';
import { normalizeEmail } from '../../common/utils/email';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string): Promise<Omit<User, 'passwordHash'>[]> {
    return this.prisma.user.findMany({
      where: { orgId },
      omit: { passwordHash: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(
    id: string,
    orgId: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.prisma.user.findFirst({
      where: { id, orgId },
      omit: { passwordHash: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByIdWithHash(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }

  async create(
    dto: CreateUserDto,
    orgId: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const normalizedEmail = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        orgId,
        email: normalizedEmail,
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      omit: { passwordHash: true },
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    requestingOrgId: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.orgId !== requestingOrgId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const data: Record<string, unknown> = {
      firstName: dto.firstName,
      lastName: dto.lastName,
    };

    if (dto.password) {
      data['passwordHash'] = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      omit: { passwordHash: true },
    });
  }
}
