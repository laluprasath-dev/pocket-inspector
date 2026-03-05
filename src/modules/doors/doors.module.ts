import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { DoorsController } from './doors.controller';
import { DoorsService } from './doors.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [DoorsController],
  providers: [DoorsService],
  exports: [DoorsService],
})
export class DoorsModule {}
