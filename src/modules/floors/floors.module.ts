import { Module } from '@nestjs/common';
import { BuildingAssignmentsModule } from '../building-assignments/building-assignments.module';
import { SurveysModule } from '../surveys/surveys.module';
import { FloorsController } from './floors.controller';
import { FloorsService } from './floors.service';

@Module({
  imports: [SurveysModule, BuildingAssignmentsModule],
  controllers: [FloorsController],
  providers: [FloorsService],
  exports: [FloorsService],
})
export class FloorsModule {}
