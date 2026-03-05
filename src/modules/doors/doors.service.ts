import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoorStatus } from '../../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { GcsService } from '../storage/gcs.service';
import { StoragePathBuilder } from '../storage/storage-path.builder';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDoorDto } from './dto/create-door.dto';
import { RegisterDoorCertificateDto } from './dto/register-door-certificate.dto';
import { RegisterImageDto } from './dto/register-image.dto';
import { RequestImageUploadDto } from './dto/request-image-upload.dto';
import { UpdateDoorDto } from './dto/update-door.dto';

@Injectable()
export class DoorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getDoorContext(doorId: string, orgId: string) {
    const door = await this.prisma.door.findFirst({
      where: { id: doorId, floor: { building: { orgId } } },
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

  private async getInspectorIdsForDoor(doorId: string): Promise<string[]> {
    const door = await this.prisma.door.findUnique({
      where: { id: doorId },
      include: {
        floor: {
          include: {
            building: {
              include: {
                inspections: {
                  include: {
                    assignments: { select: { inspectorId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!door) return [];

    const ids = new Set<string>();
    for (const inspection of door.floor.building.inspections) {
      for (const assignment of inspection.assignments) {
        ids.add(assignment.inspectorId);
      }
    }
    return Array.from(ids);
  }

  // ── Door CRUD ──────────────────────────────────────────────────────────────

  async findById(id: string, orgId: string) {
    const door = await this.prisma.door.findFirst({
      where: { id, floor: { building: { orgId } } },
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

  async create(dto: CreateDoorDto, orgId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: dto.floorId, building: { orgId } },
    });
    if (!floor) throw new NotFoundException(`Floor ${dto.floorId} not found`);

    return this.prisma.door.create({
      data: {
        floorId: dto.floorId,
        code: dto.code,
        locationNotes: dto.locationNotes,
      },
    });
  }

  async update(id: string, dto: UpdateDoorDto, orgId: string) {
    await this.getDoorContext(id, orgId);
    return this.prisma.door.update({ where: { id }, data: dto });
  }

  async submit(id: string, userId: string, orgId: string) {
    const { door } = await this.getDoorContext(id, orgId);

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
  ) {
    const { door, pathCtx } = await this.getDoorContext(doorId, orgId);

    if (door.status === DoorStatus.CERTIFIED) {
      throw new BadRequestException('Cannot upload images to a certified door');
    }

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
  ) {
    await this.getDoorContext(doorId, orgId);

    return this.prisma.doorImage.create({
      data: {
        doorId,
        role: dto.role,
        objectPathOriginal: dto.objectPath,
        objectPathThumb: dto.objectPathThumb,
        uploadedById: userId,
      },
    });
  }

  async listImages(doorId: string, orgId: string) {
    await this.getDoorContext(doorId, orgId);
    return this.prisma.doorImage.findMany({
      where: { doorId },
      orderBy: { uploadedAt: 'asc' },
    });
  }

  // ── Door certificate ───────────────────────────────────────────────────────

  async requestCertificateUpload(doorId: string, orgId: string) {
    const { door, pathCtx } = await this.getDoorContext(doorId, orgId);

    if (door.status !== DoorStatus.SUBMITTED) {
      throw new BadRequestException(
        'Door must be SUBMITTED before a certificate can be uploaded',
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
    const { door } = await this.getDoorContext(doorId, orgId);

    if (door.status !== DoorStatus.SUBMITTED) {
      throw new BadRequestException(
        'Door must be SUBMITTED to register a certificate',
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

    const inspectorIds = await this.getInspectorIdsForDoor(doorId);
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
  ): Promise<string> {
    const cert = await this.prisma.doorCertificate.findFirst({
      where: { doorId, door: { floor: { building: { orgId } } } },
    });
    if (!cert)
      throw new NotFoundException('No certificate found for this door');

    return this.gcs.getSignedDownloadUrl({
      objectPath: cert.objectPathCertificate,
    });
  }
}
