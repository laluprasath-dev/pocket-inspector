import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportsService } from './exports.service';

@ApiTags('exports', 'admin-portal')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller({ version: '1', path: 'exports' })
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @ApiOperation({ summary: 'Queue a bulk ZIP export job (admin only)' })
  create(@Body() dto: CreateExportDto, @CurrentUser() user: User) {
    return this.exportsService.create(dto, user.orgId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get export job status' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.exportsService.findById(id, user.orgId);
  }

  @Get(':id/signed-download')
  @ApiOperation({
    summary: 'Get signed download URL for a completed export (admin only)',
  })
  getDownloadUrl(@Param('id') id: string, @CurrentUser() user: User) {
    return this.exportsService.getDownloadUrl(id, user.orgId);
  }
}
