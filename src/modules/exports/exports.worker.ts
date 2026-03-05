import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { BulkExportJob } from '../../../generated/prisma/client';
import { ExportStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPORT_QUEUED_EVENT } from './exports.service';
import { ZipBuilderService } from './zip-builder.service';

@Injectable()
export class ExportsWorker {
  private readonly logger = new Logger(ExportsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zipBuilder: ZipBuilderService,
  ) {}

  @OnEvent(EXPORT_QUEUED_EVENT, { async: true })
  async handleExportQueued(job: BulkExportJob): Promise<void> {
    this.logger.log(
      `Processing export job ${job.id} [${job.targetType}:${job.targetId}]`,
    );

    await this.prisma.bulkExportJob.update({
      where: { id: job.id },
      data: { status: ExportStatus.RUNNING },
    });

    try {
      const zipPath = await this.zipBuilder.build(job);

      await this.prisma.bulkExportJob.update({
        where: { id: job.id },
        data: { status: ExportStatus.DONE, objectPathZip: zipPath },
      });

      this.logger.log(`Export job ${job.id} completed → ${zipPath}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export job ${job.id} failed: ${error}`);

      await this.prisma.bulkExportJob.update({
        where: { id: job.id },
        data: { status: ExportStatus.FAILED, error },
      });
    }
  }
}
