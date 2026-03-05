import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { FcmService, PushMessage } from './fcm.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  async registerDeviceToken(
    userId: string,
    dto: RegisterDeviceTokenDto,
  ): Promise<void> {
    await this.prisma.userDeviceToken.upsert({
      where: { userId_token: { userId, token: dto.token } },
      create: {
        userId,
        platform: dto.platform,
        token: dto.token,
        lastSeenAt: new Date(),
      },
      update: { lastSeenAt: new Date() },
    });
  }

  async notifyUsers(userIds: string[], message: PushMessage): Promise<void> {
    if (userIds.length === 0) return;

    const tokens = await this.prisma.userDeviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });

    const tokenValues = tokens.map((t) => t.token);
    await this.fcm.sendToTokens(tokenValues, message);
  }
}
