import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingAssignmentsService } from './building-assignments.service';
import { AssignBuildingDto } from './dto/assign-building.dto';
import { AssignBuildingsDto } from './dto/assign-buildings.dto';
import { AssignSiteBuildingsDto } from './dto/assign-site-buildings.dto';
import { AssignmentHistoryQueryDto } from './dto/assignment-history-query.dto';
import { ReassignBuildingDto } from './dto/reassign-building.dto';
import { RespondBuildingAssignmentDto } from './dto/respond-building-assignment.dto';

@ApiTags('building-assignments', 'admin-portal', 'mobile-photographer')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'building-assignments' })
export class BuildingAssignmentsController {
  constructor(
    private readonly buildingAssignmentsService: BuildingAssignmentsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a single building to a photographer' })
  assignBuilding(@Body() dto: AssignBuildingDto, @CurrentUser() user: User) {
    return this.buildingAssignmentsService.assignBuilding(
      dto,
      user.id,
      user.orgId,
    );
  }

  @Post('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign multiple buildings to one photographer' })
  assignMany(@Body() dto: AssignBuildingsDto, @CurrentUser() user: User) {
    return this.buildingAssignmentsService.assignMany(dto, user.id, user.orgId);
  }

  @Post('sites/:siteId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Assign current site buildings to one photographer, optionally scoped to selected building IDs',
  })
  assignSiteBuildings(
    @Param('siteId') siteId: string,
    @Body() dto: AssignSiteBuildingsDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.assignSiteBuildings(
      siteId,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Post('buildings/:buildingId/reassign')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reassign a building to a different photographer' })
  reassignBuilding(
    @Param('buildingId') buildingId: string,
    @Body() dto: ReassignBuildingDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.reassignBuilding(
      buildingId,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Post(':assignmentId/respond')
  @Roles(Role.INSPECTOR)
  @ApiOperation({ summary: 'Accept or reject a single pending building assignment' })
  respondToAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RespondBuildingAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.respondToAssignment(
      assignmentId,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Post('groups/:groupId/respond')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Accept or reject all pending assignments in a grouped site invitation',
  })
  respondToGroup(
    @Param('groupId') groupId: string,
    @Body() dto: RespondBuildingAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.respondToGroup(
      groupId,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Get('history')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Admin activity log for assignments, acceptance, reassignment, completion, and reopen actions',
  })
  getAdminHistory(
    @Query() query: AssignmentHistoryQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.listAdminHistory(user.orgId, query);
  }
}
