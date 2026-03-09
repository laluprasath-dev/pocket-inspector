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
  const port = configService.get<number>('PORT', 3000);
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
  // The collection contains no secrets — safe to expose publicly.
  const fastify = app.getHttpAdapter().getInstance();
  const postmanDir = join(process.cwd(), 'postman');

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
      reply.send(
        readFileSync(
          join(postmanDir, 'Pocket-Inspector.postman_collection.json'),
          'utf8',
        ),
      );
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
      reply.send(
        readFileSync(
          join(postmanDir, 'Pocket-Inspector.postman_environment.json'),
          'utf8',
        ),
      );
    },
  );

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