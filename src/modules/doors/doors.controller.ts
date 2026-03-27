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
import { BatchRegisterImageDto } from './dto/batch-register-image.dto';
import { BatchRequestImageUploadDto } from './dto/batch-request-image-upload.dto';
import { BulkDeleteImagesDto } from './dto/bulk-delete-images.dto';
import { CreateDoorDto } from './dto/create-door.dto';
import { RegisterDoorCertificateDto } from './dto/register-door-certificate.dto';
import { RegisterImageDto } from './dto/register-image.dto';
import { RequestImageUploadDto } from './dto/request-image-upload.dto';
import { UpdateDoorDto } from './dto/update-door.dto';
import { DoorsService } from './doors.service';

@ApiTags('doors')
@ApiBearerAuth('access-token')
@Controller({ version: '1', path: 'doors' })
export class DoorsController {
  constructor(private readonly doorsService: DoorsService) {}

  // ── Door CRUD ──────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a door on a floor (admin or inspector)' })
  create(@Body() dto: CreateDoorDto, @CurrentUser() user: User) {
    return this.doorsService.create(dto, user.orgId, user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get door details — status, image count, certificate',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.findById(id, user.orgId, user.id, user.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update door code or notes (admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDoorDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.update(id, dto, user.orgId);
  }

  @Post(':id/submit')
  @Roles(Role.INSPECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inspector submits a door (requires ≥1 image, sets SUBMITTED)',
  })
  submit(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.submit(id, user.id, user.orgId, user.role);
  }

  // ── Images ─────────────────────────────────────────────────────────────────

  @Get(':id/images')
  @ApiOperation({
    summary:
      'List all images on a door — each item includes a signed downloadUrl',
  })
  listImages(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.listImages(id, user.orgId, user.id, user.role);
  }

  @Get(':id/images/:imageId/signed-download')
  @ApiOperation({
    summary: 'Get a signed download URL for a single door image',
  })
  getImageDownloadUrl(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.getImageDownloadUrl(
      id,
      imageId,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Post(':id/images/signed-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a signed GCS upload URL for a door image' })
  requestImageUpload(
    @Param('id') id: string,
    @Body() dto: RequestImageUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.requestImageUpload(
      id,
      dto,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Post(':id/images/register')
  @ApiOperation({ summary: 'Register an image after direct GCS upload' })
  registerImage(
    @Param('id') id: string,
    @Body() dto: RegisterImageDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.registerImage(
      id,
      dto,
      user.id,
      user.orgId,
      user.role,
    );
  }

  @Post(':id/images/signed-upload/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request signed GCS upload URLs for multiple door images at once (max 10)',
  })
  batchRequestImageUpload(
    @Param('id') id: string,
    @Body() dto: BatchRequestImageUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.batchRequestImageUpload(
      id,
      dto,
      user.orgId,
      user.id,
      user.role,
    );
  }

  @Post(':id/images/register/batch')
  @ApiOperation({
    summary: 'Register multiple images after parallel GCS uploads (max 10)',
  })
  batchRegisterImages(
    @Param('id') id: string,
    @Body() dto: BatchRegisterImageDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.batchRegisterImages(
      id,
      dto,
      user.id,
      user.orgId,
      user.role,
    );
  }

  @Delete(':id/images/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete door images in bulk (max 20)',
    description:
      'Deletes image files from GCS (original + thumbnail) and removes the DB records. ' +
      'Each deletion is recorded in the audit log with a full metadata snapshot. ' +
      'Admin can delete any image on the door; inspector can only delete images they uploaded.',
  })
  bulkDeleteImages(
    @Param('id') id: string,
    @Body() dto: BulkDeleteImagesDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.bulkDeleteImages(
      id,
      dto,
      user.id,
      user.orgId,
      user.role,
    );
  }

  // ── Door certificate ───────────────────────────────────────────────────────

  @Post(':id/certificate/signed-upload')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request a signed GCS upload URL for a door certificate (admin only)',
  })
  requestCertUpload(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.requestCertificateUpload(id, user.orgId);
  }

  @Post(':id/certificate/register')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Register door certificate → sets door CERTIFIED + notifies inspectors',
  })
  registerCertificate(
    @Param('id') id: string,
    @Body() dto: RegisterDoorCertificateDto,
    @CurrentUser() user: User,
  ) {
    return this.doorsService.registerCertificate(id, dto, user.id, user.orgId);
  }

  @Get(':id/certificate/signed-download')
  @ApiOperation({
    summary: 'Get a signed download URL for the door certificate',
  })
  getCertDownloadUrl(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.getCertificateDownloadUrl(
      id,
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
      'Delete the door certificate — removes the PDF from GCS and resets the door to SUBMITTED so a new certificate can be uploaded',
  })
  deleteCertificate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.doorsService.deleteCertificate(id, user.orgId);
  }
}
