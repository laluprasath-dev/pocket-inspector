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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConfirmCompleteDto } from './dto/confirm-complete.dto';
import { CompleteFieldworkDto } from './dto/complete-fieldwork.dto';
import { ScheduleNextDto } from './dto/schedule-next.dto';
import { StartNextSurveyDto } from './dto/start-next-survey.dto';
import { SubmitSurveyDoorsDto } from './dto/submit-survey-doors.dto';
import { SurveysService } from './surveys.service';

@ApiTags('surveys', 'admin-portal', 'mobile-photographer')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'buildings/:buildingId/surveys' })
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  // ── Survey history ─────────────────────────────────────────────────────────

  @Get()
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiOperation({
    summary: 'List all survey versions for a building (history)',
  })
  list(@Param('buildingId') buildingId: string, @CurrentUser() user: User) {
    return this.surveysService.listByBuilding(
      buildingId,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Get('current')
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiOperation({ summary: 'Get the current active survey for a building' })
  getCurrent(
    @Param('buildingId') buildingId: string,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.findActive(
      buildingId,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Get(':surveyId')
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiOperation({
    summary:
      'Get a specific survey by ID — full read-only detail including floors, doors and images count',
  })
  getOne(
    @Param('buildingId') buildingId: string,
    @Param('surveyId') surveyId: string,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.findById(
      surveyId,
      buildingId,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Get(':surveyId/fieldwork-readiness')
  @Roles(Role.INSPECTOR)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiOperation({
    summary:
      'Preview fieldwork completion readiness for the active survey, including doors already submitted/certified and draft doors that can or cannot be bulk-submitted',
  })
  getFieldworkReadiness(
    @Param('buildingId') buildingId: string,
    @Param('surveyId') surveyId: string,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.getFieldworkReadiness(
      buildingId,
      surveyId,
      user.id,
      user.orgId,
    );
  }

  @Post(':surveyId/submit-doors')
  @Roles(Role.INSPECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiOperation({
    summary:
      'Bulk-submit selected active-survey doors for partial progress. Only DRAFT doors with images are submitted; blocked doors are returned with reasons.',
  })
  submitDoors(
    @Param('buildingId') buildingId: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: SubmitSurveyDoorsDto,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.submitDoors(
      buildingId,
      surveyId,
      user.id,
      user.orgId,
      dto,
    );
  }

  @Post(':surveyId/complete-fieldwork')
  @Roles(Role.INSPECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiOperation({
    summary:
      'Mark the active survey fieldwork as completed for the accepted photographer. Optionally bulk-submit valid DRAFT doors first when autoSubmitValidDoors=true.',
  })
  completeFieldwork(
    @Param('buildingId') buildingId: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: CompleteFieldworkDto,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.completeFieldwork(
      buildingId,
      surveyId,
      user.id,
      user.orgId,
      dto,
    );
  }

  @Post(':surveyId/reopen-fieldwork')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiOperation({
    summary: 'Reopen completed fieldwork for the current active survey',
  })
  reopenFieldwork(
    @Param('buildingId') buildingId: string,
    @Param('surveyId') surveyId: string,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.reopenFieldwork(
      buildingId,
      surveyId,
      user.id,
      user.orgId,
    );
  }

  // ── Survey lifecycle ───────────────────────────────────────────────────────

  @Post('confirm-complete')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiOperation({
    summary:
      'Confirm the current survey is complete (admin only). Requires building cert uploaded and all doors CERTIFIED. Optionally schedule the next survey.',
  })
  confirmComplete(
    @Param('buildingId') buildingId: string,
    @Body() dto: ConfirmCompleteDto,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.confirmComplete(
      buildingId,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Post('start-next')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiOperation({
    summary:
      'Create the next planned survey cycle (admin only). Clones floors and doors only from the last completed survey.',
  })
  startNext(
    @Param('buildingId') buildingId: string,
    @Body() dto: StartNextSurveyDto,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.startNext(buildingId, dto, user.id, user.orgId);
  }

  @Patch('current/schedule')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'buildingId', description: 'Building ID' })
  @ApiOperation({
    summary:
      'Update the next survey scheduling fields on the current active survey (admin only). Sends a push notification to the assigned photographer if provided.',
  })
  scheduleNext(
    @Param('buildingId') buildingId: string,
    @Body() dto: ScheduleNextDto,
    @CurrentUser() user: User,
  ) {
    return this.surveysService.scheduleNext(
      buildingId,
      dto,
      user.id,
      user.orgId,
    );
  }
}
