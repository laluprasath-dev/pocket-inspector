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
    summary:
      'List buildings — admin sees all, inspector sees buildings with accepted current assignments',
  })
  @ApiQuery({ name: 'siteId', required: false })
  findAll(@CurrentUser() user: User, @Query('siteId') siteId?: string) {
    return this.buildingsService.findAll(
      user.orgId,
      user.id,
      user.role,
      siteId,
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a building (admin only)' })
  create(@Body() dto: CreateBuildingDto, @CurrentUser() user: User) {
    return this.buildingsService.create(dto, user.orgId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a building by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.findById(id, user.orgId, user.id, user.role);
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
    return this.buildingsService.getFloors(id, user.orgId, user.id, user.role);
  }

  // ── Inspector approval ─────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles(Role.INSPECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Inspector approves a building (sets APPROVED — required before admin can upload certificate)',
  })
  approve(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.approve(id, user.id, user.orgId);
  }

  // ── Building certificate ───────────────────────────────────────────────────

  @Post(':id/certificate/signed-upload')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request a signed GCS upload URL for a building certificate (admin only)',
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
    return this.buildingsService.registerCertificate(
      id,
      dto,
      user.id,
      user.orgId,
    );
  }

  @Get(':id/certificate/signed-download')
  @ApiOperation({
    summary:
      'Get a signed download URL for the current active survey building certificate',
  })
  getCertDownloadUrl(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.getCertificateDownloadUrl(
      id,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Get(':id/surveys/:surveyId/certificate/signed-download')
  @ApiOperation({
    summary:
      'Get a signed download URL for the building certificate of a specific (historical) survey',
  })
  getCertDownloadUrlBySurvey(
    @Param('id') id: string,
    @Param('surveyId') surveyId: string,
    @CurrentUser() user: User,
  ) {
    return this.buildingsService.getCertificateDownloadUrlBySurvey(
      id,
      surveyId,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Delete(':id/certificate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete the building certificate — removes the PDF from GCS and deletes the record so a new certificate can be uploaded',
  })
  deleteCertificate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.buildingsService.deleteCertificate(id, user.orgId);
  }
}
