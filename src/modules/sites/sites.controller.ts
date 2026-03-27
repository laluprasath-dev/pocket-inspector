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
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SitesService } from './sites.service';

@ApiTags('sites', 'admin-portal', 'mobile-photographer')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'sites' })
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List sites — admin sees all, photographer sees sites with accepted current building assignments',
  })
  findAll(@CurrentUser() user: User) {
    return this.sitesService.findAll(user.orgId, user.id, user.role);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new site (admin only)' })
  create(@Body() dto: CreateSiteDto, @CurrentUser() user: User) {
    return this.sitesService.create(dto, user.orgId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a site by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.sitesService.findById(id, user.orgId, user.id, user.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a site (admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() user: User,
  ) {
    return this.sitesService.update(id, dto, user.orgId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a site (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.sitesService.remove(id, user.orgId);
  }
}
