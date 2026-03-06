import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // Server
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),

        // Database
        DATABASE_URL: Joi.string().required(),

        // Auth
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

        // Google Cloud Storage
        GCS_PROJECT_ID: Joi.string().required(),
        GCS_BUCKET_NAME: Joi.string().required(),
        GCS_SIGNED_URL_EXPIRY_SECONDS: Joi.number().default(900),
        GOOGLE_APPLICATION_CREDENTIALS: Joi.string().optional(),
        GCS_SERVICE_ACCOUNT_EMAIL: Joi.string().optional(),

        // Firebase Cloud Messaging
        FCM_PROJECT_ID: Joi.string().required(),
        FIREBASE_SERVICE_ACCOUNT_KEY: Joi.string().optional(),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
