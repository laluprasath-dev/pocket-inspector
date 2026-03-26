import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { PassThrough, Readable } from 'stream';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { FcmService } from '../../src/modules/notifications/fcm.service';
import { GcsService } from '../../src/modules/storage/gcs.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function createMockGcsService() {
  return {
    async getSignedUploadUrl(opts: { objectPath: string }) {
      return `https://mock-gcs.local/upload/${encodeURIComponent(opts.objectPath)}`;
    },
    async getSignedDownloadUrl(opts: { objectPath: string }) {
      return `https://mock-gcs.local/download/${encodeURIComponent(opts.objectPath)}`;
    },
    async getSignedDownloadUrlWithExpiry(opts: {
      objectPath: string;
      expirySeconds?: number;
    }) {
      const expirySeconds = opts.expirySeconds ?? 900;
      return {
        url: `https://mock-gcs.local/download/${encodeURIComponent(opts.objectPath)}`,
        expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
      };
    },
    async deleteObject() {
      return;
    },
    async objectExists() {
      return true;
    },
    createReadStream() {
      return Readable.from(Buffer.from('mock-file'));
    },
    createWriteStream() {
      return new PassThrough();
    },
    async streamToGcs() {
      return;
    },
  };
}

function createMockFcmService() {
  return {
    onModuleInit() {
      return;
    },
    async sendToToken() {
      return;
    },
    async sendToTokens() {
      return;
    },
  };
}

export async function createTestApp(): Promise<INestApplication> {
  process.env['DATABASE_URL'] =
    'postgresql://admin@localhost:5432/pocket_inspector_test';
  process.env['JWT_SECRET'] =
    'test-jwt-secret-at-least-32-chars-long-for-tests!!';
  process.env['JWT_REFRESH_SECRET'] =
    'test-refresh-secret-at-least-32-chars-long-for-tests';
  process.env['GCS_PROJECT_ID'] = 'test-project';
  process.env['GCS_BUCKET_NAME'] = 'test-bucket';
  process.env['FCM_PROJECT_ID'] = 'test-fcm-project';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GcsService)
    .useValue(createMockGcsService())
    .overrideProvider(FcmService)
    .useValue(createMockFcmService())
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // delete in dependency order
  await prisma.auditLog.deleteMany();
  await prisma.bulkExportJob.deleteMany();
  await prisma.userDeviceToken.deleteMany();
  await prisma.buildingAssignmentEvent.deleteMany();
  await prisma.buildingAssignment.deleteMany();
  await prisma.buildingAssignmentGroup.deleteMany();
  await prisma.buildingWorkflowState.deleteMany();
  await prisma.buildingCertificate.deleteMany();
  await prisma.doorCertificate.deleteMany();
  await prisma.doorImage.deleteMany();
  await prisma.door.deleteMany();
  await prisma.inspectionAssignment.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.building.deleteMany();
  await prisma.site.deleteMany();
  await prisma.client.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.org.deleteMany();
}
