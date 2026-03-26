import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { FloorsService } from './floors.service';

@ApiTags('floors')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'floors' })
export class FloorsController {
  constructor(private readonly floorsService: FloorsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a floor in a building (admin or inspector)',
  })
  create(@Body() dto: CreateFloorDto, @CurrentUser() user: User) {
    return this.floorsService.create(dto, user.orgId, user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a floor by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.floorsService.findById(id, user.orgId, user.id, user.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a floor (admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFloorDto,
    @CurrentUser() user: User,
  ) {
    return this.floorsService.update(id, dto, user.orgId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a floor (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.floorsService.remove(id, user.orgId);
  }

  @Get(':id/doors')
  @ApiOperation({
    summary:
      'List doors on a floor — inspector only sees doors in accessible buildings',
  })
  getDoors(@Param('id') id: string, @CurrentUser() user: User) {
    return this.floorsService.getDoors(id, user.orgId, user.id, user.role);
  }
}
