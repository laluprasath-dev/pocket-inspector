import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import admin from 'firebase-admin';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: admin.messaging.Messaging;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.messaging = admin.messaging();
      return;
    }

    const serviceAccountKey = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_KEY',
    );

    if (serviceAccountKey) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(serviceAccountKey) as admin.ServiceAccount,
        ),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: this.configService.getOrThrow<string>('FCM_PROJECT_ID'),
      });
    }

    this.messaging = admin.messaging();
    this.logger.log('Firebase Admin SDK initialised');
  }

  async sendToToken(token: string, message: PushMessage): Promise<void> {
    try {
      await this.messaging.send({
        token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to send FCM to token ${token.slice(0, 10)}…: ${String(err)}`,
      );
    }
  }

  async sendToTokens(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0) return;

    const results = await this.messaging.sendEach(
      tokens.map((token) => ({
        token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' as const },
        apns: { payload: { aps: { sound: 'default' } } },
      })),
    );

    const failed = results.responses.filter((r) => !r.success).length;
    if (failed > 0) {
      this.logger.warn(`${failed}/${tokens.length} FCM messages failed`);
    }
  }
}
