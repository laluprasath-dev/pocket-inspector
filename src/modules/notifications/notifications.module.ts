import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [FcmService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
