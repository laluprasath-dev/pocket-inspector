import { Module } from '@nestjs/common';
import { BuildingAssignmentsModule } from '../building-assignments/building-assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { BuildingsController } from './buildings.controller';
import { BuildingsService } from './buildings.service';

@Module({
  imports: [StorageModule, NotificationsModule, BuildingAssignmentsModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService],
})
export class BuildingsModule {}
// Note: SurveysModule is imported globally via app.module.ts and uses PrismaService directly,
// so BuildingsService can rely on PrismaService for survey queries without a circular dependency.
