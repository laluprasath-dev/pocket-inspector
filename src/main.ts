import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  await app.register(helmet, {
    contentSecurityPolicy: isProduction,
  });

  app.enableCors({
    origin: isProduction ? false : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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

  // ── Serve Postman collection + environment as importable URLs (all envs) ──
  // Files are read once at startup. Routes are only registered when both files
  // exist — missing files log a warning but never crash the application.
  const postmanDir = join(process.cwd(), 'postman');
  const collectionPath = join(
    postmanDir,
    'Pocket-Inspector.postman_collection.json',
  );
  const environmentPath = join(
    postmanDir,
    'Pocket-Inspector.postman_environment.json',
  );

  if (existsSync(collectionPath) && existsSync(environmentPath)) {
    const collectionJson = readFileSync(collectionPath, 'utf8');
    const environmentJson = readFileSync(environmentPath, 'utf8');

    const fastify = app.getHttpAdapter().getInstance();

    fastify.get(
      '/dev/postman/collection',
      (
        _req: unknown,
        reply: {
          header: (k: string, v: string) => void;
          send: (b: string) => void;
        },
      ) => {
        reply.header('Content-Type', 'application/json');
        reply.send(collectionJson);
      },
    );

    fastify.get(
      '/dev/postman/environment',
      (
        _req: unknown,
        reply: {
          header: (k: string, v: string) => void;
          send: (b: string) => void;
        },
      ) => {
        reply.header('Content-Type', 'application/json');
        reply.send(environmentJson);
      },
    );
  } else {
    console.warn(
      '[Postman] postman/ files not found — /dev/postman/* routes not registered.' +
        ' Ensure the postman/ directory is included in your Docker image.',
    );
  }

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pocket Inspector API')
      .setDescription(
        'Backend API for the Pocket Inspector mobile + admin platform',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
