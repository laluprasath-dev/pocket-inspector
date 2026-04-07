import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingAssignmentsService } from './building-assignments.service';
import { AssignmentHistoryQueryDto } from './dto/assignment-history-query.dto';

@ApiTags('building-assignments', 'mobile-photographer')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'me/building-assignments' })
export class MyBuildingAssignmentsController {
  constructor(
    private readonly buildingAssignmentsService: BuildingAssignmentsService,
  ) {}

  @Get()
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'List current photographer assignments separated into pending, acceptedActive, and acceptedPlanned buckets',
  })
  listMine(@CurrentUser() user: User) {
    return this.buildingAssignmentsService.listInspectorAssignments(
      user.id,
      user.orgId,
    );
  }

  @Get('completed-surveys')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'List read-only completed surveys previously worked on by the current photographer',
  })
  listCompletedSurveys(@CurrentUser() user: User) {
    return this.buildingAssignmentsService.listInspectorCompletedSurveys(
      user.id,
      user.orgId,
    );
  }

  @Get('completed-surveys/:surveyId')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Get read-only detail for one completed survey previously worked on by the current photographer',
  })
  getCompletedSurveyDetail(
    @CurrentUser() user: User,
    @Param('surveyId') surveyId: string,
  ) {
    return this.buildingAssignmentsService.getInspectorCompletedSurveyDetail(
      surveyId,
      user.id,
      user.orgId,
    );
  }

  @Get('completed-surveys/:surveyId/building-certificate')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Get read-only building certificate download URL for one completed survey previously worked on by the current photographer',
  })
  getCompletedSurveyBuildingCertificate(
    @CurrentUser() user: User,
    @Param('surveyId') surveyId: string,
  ) {
    return this.buildingAssignmentsService.getInspectorCompletedSurveyBuildingCertificate(
      surveyId,
      user.id,
      user.orgId,
    );
  }

  @Get('completed-surveys/:surveyId/doors/:doorId/images')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'List read-only door images for one completed survey door previously worked on by the current photographer',
  })
  getCompletedSurveyDoorImages(
    @CurrentUser() user: User,
    @Param('surveyId') surveyId: string,
    @Param('doorId') doorId: string,
  ) {
    return this.buildingAssignmentsService.getInspectorCompletedSurveyDoorImages(
      surveyId,
      doorId,
      user.id,
      user.orgId,
    );
  }

  @Get('completed-surveys/:surveyId/doors/:doorId/certificate')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Get read-only door certificate download URL for one completed survey door previously worked on by the current photographer',
  })
  getCompletedSurveyDoorCertificate(
    @CurrentUser() user: User,
    @Param('surveyId') surveyId: string,
    @Param('doorId') doorId: string,
  ) {
    return this.buildingAssignmentsService.getInspectorCompletedSurveyDoorCertificate(
      surveyId,
      doorId,
      user.id,
      user.orgId,
    );
  }

  @Get('history')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Photographer-specific assignment and workflow history with actor/timestamp details',
  })
  getMyHistory(
    @Query() query: AssignmentHistoryQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.listInspectorHistory(
      user.id,
      user.orgId,
      query,
    );
  }
}
