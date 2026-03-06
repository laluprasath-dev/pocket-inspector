import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { RegisterBuildingCertificateDto } from './dto/register-building-certificate.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@ApiTags('buildings')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'buildings' })
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  // ── Building CRUD ──────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List buildings — admin sees all, inspector sees own + assigned',
  })
  @ApiQuery({ name: 'siteId', required: false })
  findAll(@CurrentUser() user: User, @Query('siteId') siteId?: string) {
    return this.buildingsService.findAll(user.orgId, user.id, user.role as Role, siteId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a building (admin or inspector)' })
  create(@Body() dto: CreateBuildingDto, @CurrentUser() user: User) {
    return this.buildingsService.create(dto, user.orgId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a building by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.findById(id, user.orgId, user.id, user.role as Role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a building (admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingsService.update(id, dto, user.orgId);
  }

  @Get(':id/floors')
  @ApiOperation({ summary: 'List floors of a building' })
  getFloors(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.getFloors(id, user.orgId, user.id, user.role as Role);
  }

  // ── Building certificate ───────────────────────────────────────────────────

  @Post(':id/certificate/signed-upload')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a signed GCS upload URL for a building certificate (admin only)',
  })
  requestCertUpload(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.requestCertificateUpload(id, user.orgId);
  }

  @Post(':id/certificate/register')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Register building certificate + notify inspectors (admin only)',
  })
  registerCertificate(
    @Param('id') id: string,
    @Body() dto: RegisterBuildingCertificateDto,
    @CurrentUser() user: User,
  ) {
    return this.buildingsService.registerCertificate(id, dto, user.id, user.orgId);
  }

  @Get(':id/certificate/signed-download')
  @ApiOperation({ summary: 'Get a signed download URL for the building certificate' })
  getCertDownloadUrl(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.getCertificateDownloadUrl(id, user.orgId);
  }
}
