import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingAssignmentsService } from './building-assignments.service';
import { AssignmentHistoryQueryDto } from './dto/assignment-history-query.dto';

@ApiTags('building-assignments')
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
      'List current inspector assignments separated into pending and accepted buckets',
  })
  listMine(@CurrentUser() user: User) {
    return this.buildingAssignmentsService.listInspectorAssignments(
      user.id,
      user.orgId,
    );
  }

  @Get('history')
  @Roles(Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Inspector-specific assignment and workflow history with actor/timestamp details',
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
