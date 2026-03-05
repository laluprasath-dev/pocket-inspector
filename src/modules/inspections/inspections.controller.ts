import {
  Body,
  Controller,
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
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { RespondAssignmentDto } from './dto/respond-assignment.dto';
import { InspectionsService } from './inspections.service';

@ApiTags('inspections')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'inspections' })
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List inspections (admin: all; inspector: assigned only)',
  })
  findAll(@CurrentUser() user: User) {
    return this.inspectionsService.findAll(user.orgId, user.id, user.role);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new inspection (admin only)' })
  create(@Body() dto: CreateInspectionDto, @CurrentUser() user: User) {
    return this.inspectionsService.create(dto, user.orgId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an inspection with assignments' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.inspectionsService.findById(id, user.orgId);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an inspection (admin only)' })
  archive(@Param('id') id: string, @CurrentUser() user: User) {
    return this.inspectionsService.archive(id, user.orgId);
  }

  @Post(':id/assignments')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Assign an inspector to an inspection (admin only)',
  })
  createAssignment(
    @Param('id') id: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.inspectionsService.createAssignment(id, dto, user.orgId);
  }

  @Patch(':id/assignments/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or decline an assignment (inspector only)' })
  respondAssignment(
    @Param('id') id: string,
    @Body() dto: RespondAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.inspectionsService.respondAssignment(
      id,
      dto,
      user.id,
      user.orgId,
    );
  }
}
