/**
 * Minimal smoke test — verifies the app boots and basic routing works.
 * Full endpoint coverage lives in auth.e2e-spec.ts and domain.e2e-spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './helpers/app.helper';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('GET /health returns 200 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('any unknown route returns 404', async () => {
    await request(app.getHttpServer()).get('/not-a-real-route').expect(404);
  });

  it('GET / returns 404 (no root route defined)', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
