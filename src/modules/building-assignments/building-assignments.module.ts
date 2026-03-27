import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SurveysModule } from '../surveys/surveys.module';
import { BuildingAssignmentsController } from './building-assignments.controller';
import { BuildingAssignmentsService } from './building-assignments.service';
import { MyBuildingAssignmentsController } from './my-building-assignments.controller';

@Module({
  imports: [SurveysModule, NotificationsModule],
  controllers: [BuildingAssignmentsController, MyBuildingAssignmentsController],
  providers: [BuildingAssignmentsService],
  exports: [BuildingAssignmentsService],
})
export class BuildingAssignmentsModule {}
