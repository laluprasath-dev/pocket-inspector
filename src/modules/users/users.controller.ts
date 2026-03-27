import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all users in the org (admin only)' })
  findAll(@CurrentUser() user: User) {
    return this.usersService.findAll(user.orgId);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new user in the org (admin only)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: User) {
    return this.usersService.create(dto, user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (admin or self)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    if (user.role !== Role.ADMIN && user.id !== id) {
      throw new ForbiddenException('Access denied');
    }
    return this.usersService.findById(id, user.orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user (admin or self)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    if (user.role !== Role.ADMIN && user.id !== id) {
      throw new ForbiddenException('Access denied');
    }
    return this.usersService.update(id, dto, user.orgId);
  }
}
