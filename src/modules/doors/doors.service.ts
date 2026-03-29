import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import {
  BuildingAssignmentStatus,
  DoorStatus,
  Role,
  SurveyStatus,
} from '../../../generated/prisma/enums';
import { BuildingAssignmentsService } from '../building-assignments/building-assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GcsService } from '../storage/gcs.service';
import { StoragePathBuilder } from '../storage/storage-path.builder';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { BatchRegisterImageDto } from './dto/batch-register-image.dto';
import { BatchRequestImageUploadDto } from './dto/batch-request-image-upload.dto';
import { BulkDeleteImagesDto } from './dto/bulk-delete-images.dto';
import { CreateDoorDto } from './dto/create-door.dto';
import { RegisterDoorCertificateDto } from './dto/register-door-certificate.dto';
import { RegisterImageDto } from './dto/register-image.dto';
import { RequestImageUploadDto } from './dto/request-image-upload.dto';
import { UpdateDoorDto } from './dto/update-door.dto';

const THUMB_SIZE = 400; // px — max width or height, preserves aspect ratio

@Injectable()
export class DoorsService {
  private readonly logger = new Logger(DoorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly notifications: NotificationsService,
    private readonly surveys: SurveysService,
    private readonly buildingAssignments: BuildingAssignmentsService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getDoorContext(
    doorId: string,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    const door = await this.prisma.door.findFirst({
      where: { id: doorId, ...this.accessFilter(orgId, userId, role) },
      include: {
        floor: {
          include: {
            building: { select: { id: true, siteId: true, orgId: true } },
          },
        },
      },
    });
    if (!door) throw new NotFoundException(`Door ${doorId} not found`);

    return {
      door,
      pathCtx: {
        orgId: door.floor.building.orgId,
        siteId: door.floor.building.siteId,
        buildingId: door.floor.building.id,
        floorId: door.floor.id,
        doorId: door.id,
      },
    };
  }

  private assertDoorAllowsImageChanges(status: DoorStatus) {
    if (status !== DoorStatus.DRAFT) {
      throw new BadRequestException(
        'Photos can only be changed while the door is in DRAFT. Reopen the door to continue editing.',
      );
    }
  }

  private async getInspectorIdsForDoor(
    doorId: string,
    orgId: string,
  ): Promise<string[]> {
    const door = await this.prisma.door.findUnique({
      where: { id: doorId },
      select: {
        floor: {
          select: {
            buildingId: true,
            surveyId: true,
          },
        },
      },
    });

    if (!door) return [];

    let preferredSurveyId = door.floor.surveyId;
    if (!preferredSurveyId) {
      const activeSurvey = await this.prisma.survey.findFirst({
        where: {
          orgId,
          buildingId: door.floor.buildingId,
          status: SurveyStatus.ACTIVE,
        },
        select: { id: true },
      });
      preferredSurveyId = activeSurvey?.id ?? null;
    }

    if (preferredSurveyId) {
      const scopedRecipients = await this.prisma.buildingAssignment.findMany({
        where: {
          orgId,
          buildingId: door.floor.buildingId,
          surveyId: preferredSurveyId,
          status: BuildingAssignmentStatus.ACCEPTED,
          accessEndedAt: null,
        },
        select: { inspectorId: true },
      });
      if (scopedRecipients.length > 0) {
        return Array.from(
          new Set(scopedRecipients.map((assignment) => assignment.inspectorId)),
        );
      }
    }

    const legacyRecipients = await this.prisma.buildingAssignment.findMany({
      where: {
        orgId,
        buildingId: door.floor.buildingId,
        surveyId: null,
        status: BuildingAssignmentStatus.ACCEPTED,
        accessEndedAt: null,
      },
      select: { inspectorId: true },
    });

    return Array.from(
      new Set(legacyRecipients.map((assignment) => assignment.inspectorId)),
    );
  }

  // ── Door CRUD ──────────────────────────────────────────────────────────────

  async findById(id: string, orgId: string, userId: string, role: Role) {
    const door = await this.prisma.door.findFirst({
      where: { id, ...this.accessFilter(orgId, userId, role) },
      include: {
        _count: { select: { images: true } },
        certificate: { select: { id: true, uploadedAt: true } },
        floor: {
          select: {
            id: true,
            label: true,
            building: { select: { id: true, name: true, orgId: true } },
          },
        },
      },
    });
    if (!door) throw new NotFoundException(`Door ${id} not found`);

    return {
      id: door.id,
      code: door.code,
      locationNotes: door.locationNotes,
      status: door.status,
      imagesCount: door._count.images,
      certificatePresent: door.certificate !== null,
      certificateUploadedAt: door.certificate?.uploadedAt ?? null,
      submittedAt: door.submittedAt,
      certifiedAt: door.certifiedAt,
      floor: door.floor,
      createdAt: door.createdAt,
    };
  }

  async create(dto: CreateDoorDto, orgId: string, userId: string, role: Role) {
    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnFloor(
        dto.floorId,
        userId,
        orgId,
      );
    } else {
      const floor = await this.prisma.floor.findFirst({
        where: { id: dto.floorId, building: { orgId } },
      });
      if (!floor) throw new NotFoundException(`Floor ${dto.floorId} not found`);
    }

    // Guard: cannot add doors to a floor in a completed survey
    await this.surveys.assertFloorEditable(dto.floorId);

    return this.prisma.door.create({
      data: {
        floorId: dto.floorId,
        code: dto.code,
        locationNotes: dto.locationNotes,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateDoorDto, orgId: string) {
    const door = await this.prisma.door.findFirst({
      where: { id, floor: { building: { orgId } } },
    });
    if (!door) throw new NotFoundException(`Door ${id} not found`);

    // Guard: cannot update doors in a completed survey
    await this.surveys.assertDoorEditable(id);

    return this.prisma.door.update({ where: { id }, data: dto });
  }

  async submit(id: string, userId: string, orgId: string, role: Role) {
    if (role !== Role.INSPECTOR) {
      throw new ForbiddenException('Only inspectors can submit doors');
    }

    // Guard: cannot submit a door in a completed survey
    await this.surveys.assertDoorEditable(id);
    await this.buildingAssignments.assertInspectorCanWorkOnDoor(
      id,
      userId,
      orgId,
    );

    const { door } = await this.getDoorContext(id, orgId, userId, role);

    if (door.status !== DoorStatus.DRAFT) {
      throw new BadRequestException(
        `Door is already ${door.status.toLowerCase()} and cannot be re-submitted`,
      );
    }

    const imagesCount = await this.prisma.doorImage.count({
      where: { doorId: id },
    });
    if (imagesCount === 0) {
      throw new BadRequestException(
        'At least one image must be uploaded before submitting',
      );
    }

    return this.prisma.door.update({
      where: { id },
      data: {
        status: DoorStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: userId,
      },
    });
  }

  // ── Images ─────────────────────────────────────────────────────────────────

  async requestImageUpload(
    doorId: string,
    dto: RequestImageUploadDto,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    // Guard: cannot upload images to a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnDoor(
        doorId,
        userId,
        orgId,
      );
    }

    const { door, pathCtx } = await this.getDoorContext(
      doorId,
      orgId,
      userId,
      role,
    );

    this.assertDoorAllowsImageChanges(door.status);

    const imageId = crypto.randomUUID();
    const objectPath = StoragePathBuilder.doorImageOriginal({
      ...pathCtx,
      role: dto.role,
      imageId,
    });
    const contentType = dto.contentType ?? 'image/jpeg';

    const signedUrl = await this.gcs.getSignedUploadUrl({
      objectPath,
      contentType,
    });
    return { signedUrl, objectPath, imageId, role: dto.role };
  }

  async registerImage(
    doorId: string,
    dto: RegisterImageDto,
    userId: string,
    orgId: string,
    role: Role,
  ) {
    // Guard: cannot register images for a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnDoor(
        doorId,
        userId,
        orgId,
      );
    }

    const { door, pathCtx } = await this.getDoorContext(
      doorId,
      orgId,
      userId,
      role,
    );

    this.assertDoorAllowsImageChanges(door.status);

    const thumbPath =
      dto.objectPathThumb ??
      (await this.generateThumbnail(dto.objectPath, {
        ...pathCtx,
        role: dto.role,
        imageId: dto.imageId,
      }));

    return this.prisma.doorImage.create({
      data: {
        doorId,
        role: dto.role,
        label: dto.label,
        objectPathOriginal: dto.objectPath,
        objectPathThumb: thumbPath,
        uploadedById: userId,
      },
    });
  }

  async batchRequestImageUpload(
    doorId: string,
    dto: BatchRequestImageUploadDto,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    // Guard: cannot batch-upload images to a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnDoor(
        doorId,
        userId,
        orgId,
      );
    }

    const { door, pathCtx } = await this.getDoorContext(
      doorId,
      orgId,
      userId,
      role,
    );

    this.assertDoorAllowsImageChanges(door.status);

    return Promise.all(
      dto.images.map(async (item) => {
        const imageId = crypto.randomUUID();
        const objectPath = StoragePathBuilder.doorImageOriginal({
          ...pathCtx,
          role: item.role,
          imageId,
        });
        const contentType = item.contentType ?? 'image/jpeg';
        const signedUrl = await this.gcs.getSignedUploadUrl({
          objectPath,
          contentType,
        });
        return { signedUrl, objectPath, imageId, role: item.role };
      }),
    );
  }

  async batchRegisterImages(
    doorId: string,
    dto: BatchRegisterImageDto,
    userId: string,
    orgId: string,
    role: Role,
  ) {
    // Guard: cannot batch-register images for a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnDoor(
        doorId,
        userId,
        orgId,
      );
    }

    const { door, pathCtx } = await this.getDoorContext(
      doorId,
      orgId,
      userId,
      role,
    );

    this.assertDoorAllowsImageChanges(door.status);

    // Generate all thumbnails in parallel before the transaction
    const withThumbs = await Promise.all(
      dto.images.map(async (item) => ({
        ...item,
        resolvedThumb:
          item.objectPathThumb ??
          (await this.generateThumbnail(item.objectPath, {
            ...pathCtx,
            role: item.role,
            imageId: item.imageId,
          })),
      })),
    );

    return this.prisma.$transaction(
      withThumbs.map((item) =>
        this.prisma.doorImage.create({
          data: {
            doorId,
            role: item.role,
            label: item.label,
            objectPathOriginal: item.objectPath,
            objectPathThumb: item.resolvedThumb,
            uploadedById: userId,
          },
        }),
      ),
    );
  }

  async listImages(doorId: string, orgId: string, userId: string, role: Role) {
    await this.getDoorContext(doorId, orgId, userId, role);
    const images = await this.prisma.doorImage.findMany({
      where: { doorId },
      orderBy: { uploadedAt: 'asc' },
    });

    return Promise.all(
      images.map(async (img) => {
        const original = await this.gcs.getSignedDownloadUrlWithExpiry({
          objectPath: img.objectPathOriginal,
        });
        const thumb = img.objectPathThumb
          ? await this.gcs.getSignedDownloadUrlWithExpiry({
              objectPath: img.objectPathThumb,
              expirySeconds: 7 * 24 * 3600,
            })
          : null;

        return {
          ...img,
          downloadUrl: original.url,
          downloadUrlExpiresAt: original.expiresAt,
          downloadUrlThumb: thumb?.url ?? null,
          downloadUrlThumbExpiresAt: thumb?.expiresAt ?? null,
        };
      }),
    );
  }

  async getImageDownloadUrl(
    doorId: string,
    imageId: string,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    await this.getDoorContext(doorId, orgId, userId, role);
    const image = await this.prisma.doorImage.findFirst({
      where: { id: imageId, doorId },
    });
    if (!image) throw new NotFoundException(`Image ${imageId} not found`);

    const original = await this.gcs.getSignedDownloadUrlWithExpiry({
      objectPath: image.objectPathOriginal,
    });
    const thumb = image.objectPathThumb
      ? await this.gcs.getSignedDownloadUrlWithExpiry({
          objectPath: image.objectPathThumb,
          expirySeconds: 7 * 24 * 3600,
        })
      : null;

    return {
      role: image.role,
      label: image.label,
      downloadUrl: original.url,
      downloadUrlExpiresAt: original.expiresAt,
      downloadUrlThumb: thumb?.url ?? null,
      downloadUrlThumbExpiresAt: thumb?.expiresAt ?? null,
    };
  }

  // ── Bulk delete images ─────────────────────────────────────────────────────

  async bulkDeleteImages(
    doorId: string,
    dto: BulkDeleteImagesDto,
    userId: string,
    orgId: string,
    role: Role,
  ) {
    // Guard: cannot delete images from a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    if (role === Role.INSPECTOR) {
      await this.buildingAssignments.assertInspectorCanWorkOnDoor(
        doorId,
        userId,
        orgId,
      );
    }

    const { door } = await this.getDoorContext(doorId, orgId, userId, role);

    this.assertDoorAllowsImageChanges(door.status);

    // Load all requested images — must belong to this door and org
    const images = await this.prisma.doorImage.findMany({
      where: {
        id: { in: dto.imageIds },
        doorId,
        door: { floor: { building: { orgId } } },
      },
    });

    if (images.length === 0) {
      throw new NotFoundException('No matching images found for this door');
    }

    if (role === Role.INSPECTOR) {
      const foreignImages = images.filter((img) => img.uploadedById !== userId);
      if (foreignImages.length > 0) {
        throw new ForbiddenException(
          'Inspectors can only delete images that they uploaded themselves',
        );
      }
    }

    const notFound = dto.imageIds.filter(
      (id) => !images.find((img) => img.id === id),
    );
    if (notFound.length > 0) {
      throw new NotFoundException(
        `Images not found or not accessible: ${notFound.join(', ')}`,
      );
    }

    // Delete GCS objects (original + thumb) — best effort, don't fail on missing files
    await Promise.allSettled(
      images.flatMap((img) => [
        this.gcs.deleteObject(img.objectPathOriginal),
        img.objectPathThumb
          ? this.gcs.deleteObject(img.objectPathThumb)
          : Promise.resolve(),
      ]),
    );

    // In a single transaction: delete DB records + write audit log entries
    await this.prisma.$transaction([
      this.prisma.doorImage.deleteMany({
        where: { id: { in: images.map((i) => i.id) } },
      }),
      ...images.map((img) =>
        this.prisma.auditLog.create({
          data: {
            orgId,
            performedById: userId,
            action: 'DOOR_IMAGE_DELETED',
            entityType: 'DoorImage',
            entityId: img.id,
            metadata: {
              doorId,
              role: img.role,
              label: img.label,
              objectPathOriginal: img.objectPathOriginal,
              objectPathThumb: img.objectPathThumb,
              uploadedById: img.uploadedById,
              uploadedAt: img.uploadedAt.toISOString(),
            },
          },
        }),
      ),
    ]);

    this.logger.log(
      `User ${userId} deleted ${images.length} image(s) from door ${doorId}`,
    );

    return {
      deleted: images.length,
      imageIds: images.map((i) => i.id),
    };
  }

  // ── Door certificate ───────────────────────────────────────────────────────

  async requestCertificateUpload(doorId: string, orgId: string) {
    // Guard: cannot upload a certificate to a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    const { door, pathCtx } = await this.getDoorContext(
      doorId,
      orgId,
      '',
      Role.ADMIN,
    );

    if (door.status === DoorStatus.DRAFT) {
      throw new BadRequestException(
        'Door must be submitted by a photographer before a certificate can be uploaded',
      );
    }

    const certId = crypto.randomUUID();
    const objectPath = StoragePathBuilder.doorCertificate({
      ...pathCtx,
      certId,
    });

    const signedUrl = await this.gcs.getSignedUploadUrl({
      objectPath,
      contentType: 'application/pdf',
    });
    return { signedUrl, objectPath, certId };
  }

  async registerCertificate(
    doorId: string,
    dto: RegisterDoorCertificateDto,
    adminId: string,
    orgId: string,
  ) {
    // Guard: cannot register a certificate for a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    const { door } = await this.getDoorContext(doorId, orgId, '', Role.ADMIN);

    if (door.status === DoorStatus.DRAFT) {
      throw new BadRequestException(
        'Door must be submitted by a photographer before a certificate can be registered',
      );
    }

    const [cert] = await this.prisma.$transaction([
      this.prisma.doorCertificate.upsert({
        where: { doorId },
        create: {
          doorId,
          objectPathCertificate: dto.objectPath,
          uploadedById: adminId,
        },
        update: {
          objectPathCertificate: dto.objectPath,
          uploadedById: adminId,
          uploadedAt: new Date(),
        },
      }),
      this.prisma.door.update({
        where: { id: doorId },
        data: {
          status: DoorStatus.CERTIFIED,
          certifiedAt: new Date(),
          certifiedById: adminId,
        },
      }),
    ]);

    const inspectorIds = await this.getInspectorIdsForDoor(doorId, orgId);
    await this.notifications.notifyUsers(inspectorIds, {
      title: 'Door certified',
      body: `Door ${door.code} has been certified.`,
      data: { doorId, type: 'DOOR_CERTIFIED' },
    });

    return cert;
  }

  async getCertificateDownloadUrl(
    doorId: string,
    orgId: string,
    userId: string,
    role: Role,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    await this.getDoorContext(doorId, orgId, userId, role);
    const cert = await this.prisma.doorCertificate.findFirst({
      where: { doorId, door: { floor: { building: { orgId } } } },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this door');

    const { url, expiresAt } = await this.gcs.getSignedDownloadUrlWithExpiry({
      objectPath: cert.objectPathCertificate,
      responseDisposition: 'attachment; filename="certificate.pdf"',
    });
    return { signedUrl: url, expiresAt };
  }

  async deleteCertificate(doorId: string, orgId: string): Promise<void> {
    // Guard: cannot delete a certificate from a door in a completed survey
    await this.surveys.assertDoorEditable(doorId);

    const { door } = await this.getDoorContext(doorId, orgId, '', Role.ADMIN);

    if (door.status !== DoorStatus.CERTIFIED) {
      throw new BadRequestException(
        'Only a CERTIFIED door has a certificate that can be deleted',
      );
    }

    const cert = await this.prisma.doorCertificate.findUnique({
      where: { doorId },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this door');

    await this.prisma.$transaction([
      this.prisma.doorCertificate.delete({ where: { doorId } }),
      this.prisma.door.update({
        where: { id: doorId },
        data: {
          status: DoorStatus.SUBMITTED,
          certifiedAt: null,
          certifiedById: null,
        },
      }),
    ]);

    await this.gcs.deleteObject(cert.objectPathCertificate);
  }

  async reopenForEdits(doorId: string, orgId: string): Promise<{
    id: string;
    status: DoorStatus;
    submittedAt: Date | null;
    submittedById: string | null;
    certifiedAt: Date | null;
    certifiedById: string | null;
  }> {
    await this.surveys.assertDoorEditable(doorId);

    const { door } = await this.getDoorContext(doorId, orgId, '', Role.ADMIN);

    if (door.status === DoorStatus.DRAFT) {
      throw new BadRequestException('Door is already in DRAFT');
    }

    if (door.status === DoorStatus.CERTIFIED) {
      throw new BadRequestException(
        'Delete the certificate before reopening a certified door for edits',
      );
    }

    return this.prisma.door.update({
      where: { id: doorId },
      data: {
        status: DoorStatus.DRAFT,
        submittedAt: null,
        submittedById: null,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        submittedById: true,
        certifiedAt: true,
        certifiedById: true,
      },
    });
  }

  // ── Thumbnail generation ───────────────────────────────────────────────────

  private async generateThumbnail(
    originalPath: string,
    thumbParams: Parameters<typeof StoragePathBuilder.doorImageThumb>[0],
  ): Promise<string | null> {
    const thumbPath = StoragePathBuilder.doorImageThumb(thumbParams);
    try {
      // Stream original from GCS → Sharp resize → write thumbnail back to GCS
      const readStream = this.gcs.createReadStream(originalPath);
      readStream.on('error', (err) => {
        this.logger.warn(
          `Thumbnail read error for ${originalPath}: ${String(err)}`,
        );
      });

      const resizer = sharp()
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 75 });

      const writeStream = this.gcs.createWriteStream(thumbPath, 'image/jpeg');

      await new Promise<void>((resolve, reject) => {
        readStream
          .on('error', reject)
          .pipe(resizer)
          .on('error', reject)
          .pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      this.logger.debug(`Thumbnail generated: ${thumbPath}`);
      return thumbPath;
    } catch (err) {
      this.logger.warn(
        `Thumbnail generation failed for ${originalPath}: ${String(err)}`,
      );
      return null;
    }
  }

  // ── Access filter ─────────────────────────────────────────────────────────
  // ADMIN (or empty userId with ADMIN role for cert operations): all doors in org
  // INSPECTOR: doors they created OR in buildings assigned to them

  private accessFilter(orgId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return { floor: { building: { orgId } } };

    return {
      floor: {
        building: {
          orgId,
          assignments: {
            some: {
              inspectorId: userId,
              status: BuildingAssignmentStatus.ACCEPTED,
              accessEndedAt: null,
            },
          },
        },
      },
    };
  }
}
