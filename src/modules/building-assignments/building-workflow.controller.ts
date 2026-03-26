import { Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingAssignmentsService } from './building-assignments.service';

@ApiTags('buildings')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'buildings/:buildingId/workflow' })
export class BuildingWorkflowController {
  constructor(
    private readonly buildingAssignmentsService: BuildingAssignmentsService,
  ) {}

  @Post('complete')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Mark the building inspection execution workflow as completed for the current accepted inspector',
  })
  complete(
    @Param('buildingId') buildingId: string,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.completeWorkflow(
      buildingId,
      user.id,
      user.orgId,
    );
  }

  @Post('reopen')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Reopen a completed building inspection execution workflow for correction and resubmission',
  })
  reopen(
    @Param('buildingId') buildingId: string,
    @CurrentUser() user: User,
  ) {
    return this.buildingAssignmentsService.reopenWorkflow(
      buildingId,
      user.id,
      user.orgId,
    );
  }
}
