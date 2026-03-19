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
import { ScheduleNextDto } from './dto/schedule-next.dto';
import { StartNextSurveyDto } from './dto/start-next-survey.dto';
import { SurveysService } from './surveys.service';

@ApiTags('surveys')
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
      'Start the next survey cycle (admin only). Clones all floors and doors from the last completed survey, without images or certificates. Resets building status to DRAFT.',
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
      'Update the next survey scheduling fields on the current active survey (admin only). Sends a push notification to the assigned inspector if provided.',
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
