import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './helpers/app.helper';
import { seedTestData, TestSeeds } from './helpers/seed.helper';

/** Login and return bearer token */
async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password });
  return res.body.data.accessToken as string;
}

describe('Domain Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeds: TestSeeds;
  let adminToken: string;
  let inspectorToken: string;

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
    adminToken = await login(app, seeds.admin.email, seeds.admin.password);
    inspectorToken = await login(
      app,
      seeds.inspector.email,
      seeds.inspector.password,
    );
  });

  // ── Orgs ──────────────────────────────────────────────────────────────────

  describe('Orgs', () => {
    it('GET /v1/orgs/me returns the org', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/orgs/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: seeds.org.id,
        name: seeds.org.name,
      });
    });

    it('PATCH /v1/orgs/me updates org name (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/orgs/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Org' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Org');
    });

    it('PATCH /v1/orgs/me returns 403 for inspector', async () => {
      await request(app.getHttpServer())
        .patch('/v1/orgs/me')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  describe('Users', () => {
    it('GET /v1/users returns all users in org (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(
        res.body.data.every((u: any) => u.passwordHash === undefined),
      ).toBe(true);
    });

    it('GET /v1/users returns 403 for inspector', async () => {
      await request(app.getHttpServer())
        .get('/v1/users')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('POST /v1/users creates a new user (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'new.user@test.com',
          password: 'NewPass1234!',
          role: 'INSPECTOR',
          firstName: 'New',
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        email: 'new.user@test.com',
        role: 'INSPECTOR',
      });
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('POST /v1/users returns 409 for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: seeds.inspector.email,
          password: 'Test1234!',
          role: 'INSPECTOR',
        })
        .expect(409);
    });

    it('POST /v1/users returns 400 for invalid role', async () => {
      await request(app.getHttpServer())
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'new@test.com',
          password: 'Test1234!',
          role: 'SUPERADMIN',
        })
        .expect(400);
    });

    it('GET /v1/users/:id - inspector can get own profile', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/users/${seeds.inspector.id}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(seeds.inspector.id);
    });

    it("GET /v1/users/:id - inspector cannot access another user's profile", async () => {
      await request(app.getHttpServer())
        .get(`/v1/users/${seeds.admin.id}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('PATCH /v1/users/:id - inspector can update own profile', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/users/${seeds.inspector.id}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(res.body.data.firstName).toBe('Updated');
    });
  });

  // ── Sites ─────────────────────────────────────────────────────────────────

  describe('Sites', () => {
    it('POST + GET full CRUD flow', async () => {
      const create = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Site',
          referenceCode: 'S-001',
          locationNotes: 'City centre',
        })
        .expect(201);

      const siteId = create.body.data.id;
      expect(create.body.data).toMatchObject({
        name: 'Test Site',
        referenceCode: 'S-001',
      });

      // GET all
      const list = await request(app.getHttpServer())
        .get('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((s: any) => s.id === siteId)).toBe(true);

      // GET by id
      const get = await request(app.getHttpServer())
        .get(`/v1/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(get.body.data.id).toBe(siteId);

      // PATCH
      const patch = await request(app.getHttpServer())
        .patch(`/v1/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed Site' })
        .expect(200);
      expect(patch.body.data.name).toBe('Renamed Site');

      // DELETE
      await request(app.getHttpServer())
        .delete(`/v1/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Confirm deleted
      await request(app.getHttpServer())
        .get(`/v1/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('POST /v1/sites returns 403 for inspector', async () => {
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ name: 'Hack Site' })
        .expect(403);
    });

    it('POST /v1/sites returns 400 for missing name', async () => {
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ referenceCode: 'S-001' })
        .expect(400);
    });
  });

  // ── Buildings ─────────────────────────────────────────────────────────────

  describe('Buildings', () => {
    let buildingId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Block A', buildingCode: 'BLD-001' });
      buildingId = res.body.data.id;
    });

    it('GET /v1/buildings lists buildings', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.some((b: any) => b.id === buildingId)).toBe(true);
    });

    it('GET /v1/buildings?siteId= filters by site', async () => {
      const siteRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Site X' });
      const siteId = siteRes.body.data.id;

      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Site Building', siteId });

      const res = await request(app.getHttpServer())
        .get(`/v1/buildings?siteId=${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.every((b: any) => b.siteId === siteId)).toBe(true);
    });

    it('GET /v1/buildings/:id/floors returns empty array initially', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('returns 404 for building in another org', async () => {
      await request(app.getHttpServer())
        .get('/v1/buildings/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('inspector can list buildings but cannot create', async () => {
      await request(app.getHttpServer())
        .get('/v1/buildings')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ name: 'Hack Building' })
        .expect(403);
    });
  });

  // ── Floors ────────────────────────────────────────────────────────────────

  describe('Floors', () => {
    let buildingId: string;
    let floorId: string;

    beforeEach(async () => {
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Building' });
      buildingId = bRes.body.data.id;

      const fRes = await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buildingId, label: 'G', notes: 'Ground floor' });
      floorId = fRes.body.data.id;
    });

    it('creates floor and appears in building floors list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}/floors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.some((f: any) => f.id === floorId)).toBe(true);
    });

    it('GET /v1/floors/:id/doors returns empty array initially', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/floors/${floorId}/doors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('PATCH /v1/floors/:id updates label', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/floors/${floorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: '1' })
        .expect(200);

      expect(res.body.data.label).toBe('1');
    });

    it('returns 400 creating floor with non-existent buildingId', async () => {
      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buildingId: 'fake-id', label: 'B1' })
        .expect(404);
    });
  });

  // ── Doors ─────────────────────────────────────────────────────────────────

  describe('Doors', () => {
    let floorId: string;
    let doorId: string;

    beforeEach(async () => {
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Door Test Building' });
      const fRes = await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buildingId: bRes.body.data.id, label: 'G' });
      floorId = fRes.body.data.id;

      const dRes = await request(app.getHttpServer())
        .post('/v1/doors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ floorId, code: 'D-101', locationNotes: 'End of corridor' });
      doorId = dRes.body.data.id;
    });

    it('GET /v1/doors/:id returns door with status=DRAFT and imagesCount=0', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doors/${doorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: doorId,
        code: 'D-101',
        status: 'DRAFT',
        imagesCount: 0,
        certificatePresent: false,
      });
    });

    it('POST /v1/doors/:id/submit fails with 400 when no images', async () => {
      await request(app.getHttpServer())
        .post(`/v1/doors/${doorId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(400);
    });

    it('POST /v1/doors/:id/submit succeeds after image registered', async () => {
      // Manually insert an image record
      await prisma.doorImage.create({
        data: {
          doorId,
          role: 'FRONT_FACE',
          objectPathOriginal:
            'orgs/test/buildings/b/floors/f/doors/d/images/original/front/img.jpg',
          uploadedById: seeds.inspector.id,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/doors/${doorId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.submittedAt).toBeTruthy();
    });

    it('POST /v1/doors/:id/submit cannot re-submit an already SUBMITTED door', async () => {
      await prisma.doorImage.create({
        data: {
          doorId,
          role: 'FRONT_FACE',
          objectPathOriginal: 'test/path.jpg',
          uploadedById: seeds.inspector.id,
        },
      });

      await request(app.getHttpServer())
        .post(`/v1/doors/${doorId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/doors/${doorId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(400);
    });

    it('GET /v1/floors/:id/doors shows door with image count', async () => {
      await prisma.doorImage.create({
        data: {
          doorId,
          role: 'REAR_FACE',
          objectPathOriginal: 'test/path.jpg',
          uploadedById: seeds.inspector.id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/floors/${floorId}/doors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const door = res.body.data.find((d: any) => d.id === doorId);
      expect(door.imagesCount).toBe(1);
      expect(door.status).toBe('DRAFT');
    });

    it('returns 404 for door not in org', async () => {
      await request(app.getHttpServer())
        .get('/v1/doors/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── Inspections ────────────────────────────────────────────────────────────

  describe('Inspections', () => {
    let buildingId: string;

    beforeEach(async () => {
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Inspection Building' });
      buildingId = bRes.body.data.id;
    });

    it('POST /v1/inspections creates a BUILDING inspection', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'BUILDING', buildingId })
        .expect(201);

      expect(res.body.data).toMatchObject({
        type: 'BUILDING',
        buildingId,
        status: 'ACTIVE',
        orgId: seeds.org.id,
      });
    });

    it('POST /v1/inspections fails without buildingId for BUILDING type', async () => {
      await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'BUILDING' })
        .expect(400);
    });

    it('POST /v1/inspections fails for inspector', async () => {
      await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ type: 'BUILDING', buildingId })
        .expect(403);
    });

    it('full assignment flow: create → assign inspector → inspector responds', async () => {
      const iRes = await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'BUILDING', buildingId });
      const inspectionId = iRes.body.data.id;

      // Admin assigns inspector
      const aRes = await request(app.getHttpServer())
        .post(`/v1/inspections/${inspectionId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          inspectorId: seeds.inspector.id,
          adminNote: 'Please do this urgently',
        })
        .expect(201);

      expect(aRes.body.data).toMatchObject({ status: 'PENDING' });

      // Duplicate assignment rejected
      await request(app.getHttpServer())
        .post(`/v1/inspections/${inspectionId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: seeds.inspector.id })
        .expect(400);

      // Inspector accepts
      const rRes = await request(app.getHttpServer())
        .patch(`/v1/inspections/${inspectionId}/assignments/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED', inspectorNote: 'On it!' })
        .expect(200);

      expect(rRes.body.data.status).toBe('ACCEPTED');

      // Cannot respond twice
      await request(app.getHttpServer())
        .patch(`/v1/inspections/${inspectionId}/assignments/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'DECLINED' })
        .expect(403);
    });

    it('GET /v1/inspections - admin sees all, inspector sees only assigned', async () => {
      const i1 = await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'BUILDING', buildingId });

      // Inspector has no assignments yet
      const inspectorList = await request(app.getHttpServer())
        .get('/v1/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);
      expect(inspectorList.body.data).toHaveLength(0);

      // Assign inspector
      await request(app.getHttpServer())
        .post(`/v1/inspections/${i1.body.data.id}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: seeds.inspector.id });

      const inspectorListAfter = await request(app.getHttpServer())
        .get('/v1/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);
      expect(inspectorListAfter.body.data).toHaveLength(1);
    });

    it('PATCH /:id/archive archives an inspection', async () => {
      const i = await request(app.getHttpServer())
        .post('/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'BUILDING', buildingId });

      const res = await request(app.getHttpServer())
        .patch(`/v1/inspections/${i.body.data.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');
    });
  });

  // ── Health ────────────────────────────────────────────────────────────────

  describe('Health', () => {
    it('GET /health returns 200 with db ok (no auth required)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body.data).toMatchObject({
        status: 'ok',
        services: { database: { status: 'ok' } },
      });
      expect(res.body.data.services.database.latencyMs).toBeGreaterThanOrEqual(
        0,
      );
    });
  });

  // ── Cross-tenant security ─────────────────────────────────────────────────

  describe('Cross-tenant security', () => {
    it('admin cannot access resources from another org', async () => {
      // Create a second org + admin
      const org2 = await prisma.org.create({ data: { name: 'Other Org' } });
      const hash = await (await import('bcrypt')).hash('Admin1234!', 4);
      await prisma.user.create({
        data: {
          orgId: org2.id,
          email: 'admin2@other.com',
          passwordHash: hash,
          role: 'ADMIN',
        },
      });

      const otherAdminRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin2@other.com', password: 'Admin1234!' });
      const otherToken = otherAdminRes.body.data.accessToken;

      // Create a site in org1
      const siteRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Org1 Site' });
      const siteId = siteRes.body.data.id;

      // Org2 admin cannot see org1's site
      await request(app.getHttpServer())
        .get(`/v1/sites/${siteId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });
  });
});
