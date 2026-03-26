import { Module } from '@nestjs/common';
import { BuildingAssignmentsModule } from '../building-assignments/building-assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { SurveysModule } from '../surveys/surveys.module';
import { DoorsController } from './doors.controller';
import { DoorsService } from './doors.service';

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    SurveysModule,
    BuildingAssignmentsModule,
  ],
  controllers: [DoorsController],
  providers: [DoorsService],
  exports: [DoorsService],
})
export class DoorsModule {}
