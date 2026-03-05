import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './helpers/app.helper';
import { seedTestData, TestSeeds } from './helpers/seed.helper';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeds: TestSeeds;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    seeds = await seedTestData(prisma);
  });

  // ── POST /v1/auth/login ────────────────────────────────────────────────────

  describe('POST /v1/auth/login', () => {
    it('returns 200 + token pair on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: seeds.admin.password })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('returns 401 on wrong password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: 'WrongPassword1!' })
        .expect(401);
    });

    it('returns 401 on unknown email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'ghost@test.com', password: 'Admin1234!' })
        .expect(401);
    });

    it('returns 401 on invalid email format (passport-local intercepts before DTO validation)', async () => {
      // LocalAuthGuard runs before the ValidationPipe, so malformed input
      // reaches passport-local which fails authentication → 401 not 400.
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'not-an-email', password: 'Admin1234!' })
        .expect(401);
    });

    it('returns 401 when password too short (passport-local intercepts before DTO validation)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: 'short' })
        .expect(401);
    });

    it('returns 401 on missing fields (passport-local intercepts before DTO validation)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({})
        .expect(401);
    });

    it('ignores unknown extra fields (passport-local strategy only reads email+password)', async () => {
      // Passport-local extracts username/password and ignores other fields.
      // Valid credentials succeed even with extra fields in the body.
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: seeds.admin.password, hack: 'payload' })
        .expect(200);

      expect(res.body.data.accessToken).toBeTruthy();
    });
  });

  // ── POST /v1/auth/refresh ──────────────────────────────────────────────────

  describe('POST /v1/auth/refresh', () => {
    it('returns a new token pair with a valid refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: seeds.admin.password });

      const { refreshToken } = loginRes.body.data;

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      // Tokens are valid JWTs (3-part dot-separated strings)
      expect(res.body.data.accessToken.split('.').length).toBe(3);
      expect(res.body.data.refreshToken.split('.').length).toBe(3);
    });

    it('returns 401 on tampered refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'totally.fake.token' })
        .expect(401);
    });

    it('returns 401 when sending an access token as refresh token', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: seeds.admin.password });

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: body.data.accessToken })
        .expect(401);
    });

    it('returns 400 on missing refreshToken field', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // ── GET /v1/auth/me ────────────────────────────────────────────────────────

  describe('GET /v1/auth/me', () => {
    it('returns current user without passwordHash', async () => {
      const { body: loginBody } = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: seeds.admin.email, password: seeds.admin.password });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: seeds.admin.id,
        email: seeds.admin.email,
        role: 'ADMIN',
        orgId: seeds.org.id,
      });
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('returns 401 with no token', async () => {
      await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
    });

    it('returns 401 with malformed bearer token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer not.a.real.jwt')
        .expect(401);
    });

    it('returns 401 with expired/invalid signature token', async () => {
      const fakeToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalid_signature';
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);
    });
  });

  // ── Security: unauthenticated access to protected routes ──────────────────

  describe('Security: unauthenticated access', () => {
    const protectedRoutes = [
      { method: 'get', path: '/v1/users' },
      { method: 'get', path: '/v1/orgs/me' },
      { method: 'get', path: '/v1/sites' },
      { method: 'get', path: '/v1/buildings' },
      { method: 'get', path: '/v1/inspections' },
    ];

    it.each(protectedRoutes)(
      'returns 401 for $method $path without token',
      async ({ method, path }) => {
        await (request(app.getHttpServer()) as any)[method](path).expect(401);
      },
    );
  });
});
