import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateOrgDto } from './dto/update-org.dto';
import { OrgsService } from './orgs.service';

@ApiTags('orgs')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'orgs' })
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the current user's organisation" })
  getMyOrg(@CurrentUser() user: User) {
    return this.orgsService.findById(user.orgId);
  }

  @Patch('me')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update the organisation name (admin only)' })
  updateMyOrg(@Body() dto: UpdateOrgDto, @CurrentUser() user: User) {
    return this.orgsService.update(user.orgId, dto);
  }
}
