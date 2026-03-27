import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BulkExportJob } from '../../../generated/prisma/client';
import { ExportStatus, ExportTargetType } from '../../../generated/prisma/enums';
import { GcsService } from '../storage/gcs.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateExportDto,
  SUPPORTED_EXPORT_TARGET_TYPES,
} from './dto/create-export.dto';

export const EXPORT_QUEUED_EVENT = 'export.queued';

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    dto: CreateExportDto,
    orgId: string,
    userId: string,
  ): Promise<BulkExportJob> {
    if (
      !(SUPPORTED_EXPORT_TARGET_TYPES as readonly ExportTargetType[]).includes(
        dto.targetType,
      )
    ) {
      throw new BadRequestException(
        `Unsupported export target type: ${dto.targetType}`,
      );
    }

    const job = await this.prisma.bulkExportJob.create({
      data: {
        orgId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        createdById: userId,
        status: ExportStatus.QUEUED,
      },
    });

    this.eventEmitter.emit(EXPORT_QUEUED_EVENT, job);
    return job;
  }

  async findById(id: string, orgId: string): Promise<BulkExportJob> {
    const job = await this.prisma.bulkExportJob.findFirst({
      where: { id, orgId },
    });
    if (!job) throw new NotFoundException(`Export job ${id} not found`);
    return job;
  }

  async getDownloadUrl(
    id: string,
    orgId: string,
  ): Promise<{ signedUrl: string }> {
    const job = await this.findById(id, orgId);

    if (job.status !== ExportStatus.DONE || !job.objectPathZip) {
      throw new BadRequestException('Export is not ready for download yet');
    }

    const signedUrl = await this.gcs.getSignedDownloadUrl({
      objectPath: job.objectPathZip,
      expirySeconds: 300,
    });
    return { signedUrl };
  }
}
