import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportsWorker } from './exports.worker';
import { ZipBuilderService } from './zip-builder.service';

@Module({
  imports: [StorageModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExportsWorker, ZipBuilderService],
})
export class ExportsModule {}
