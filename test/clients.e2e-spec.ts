import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './helpers/app.helper';
import { seedTestData, TestSeeds } from './helpers/seed.helper';

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

describe('Clients (e2e)', () => {
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

  // ── Client CRUD ──────────────────────────────────────────────────────────

  describe('Client CRUD', () => {
    it('POST /v1/clients creates a client (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Acme Corp',
          contactName: 'John Smith',
          contactEmail: 'john@acme.com',
          contactPhone: '+44 123 456',
          address: '123 Main St',
          notes: 'Key account',
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        name: 'Acme Corp',
        contactName: 'John Smith',
        contactEmail: 'john@acme.com',
        contactPhone: '+44 123 456',
        address: '123 Main St',
        notes: 'Key account',
      });
      expect(res.body.data.id).toBeDefined();
    });

    it('POST /v1/clients requires only name', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Minimal Client' })
        .expect(201);

      expect(res.body.data.name).toBe('Minimal Client');
      expect(res.body.data.contactName).toBeNull();
    });

    it('POST /v1/clients returns 400 without name', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactName: 'No Name' })
        .expect(400);
    });

    it('POST /v1/clients returns 409 for duplicate name in same org', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate' })
        .expect(409);
    });

    it('POST /v1/clients returns 403 for inspector', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ name: 'Blocked' })
        .expect(403);
    });

    it('GET /v1/clients lists all clients (admin only)', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client A' });
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client B' });

      const res = await request(app.getHttpServer())
        .get('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Client A');
      expect(res.body.data[1].name).toBe('Client B');
    });

    it('GET /v1/clients returns 403 for inspector', async () => {
      await request(app.getHttpServer())
        .get('/v1/clients')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('GET /v1/clients/:id returns client with linked sites and buildings', async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Detail Client' });
      const clientId = cRes.body.data.id;

      const res = await request(app.getHttpServer())
        .get(`/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(clientId);
      expect(res.body.data.name).toBe('Detail Client');
      expect(res.body.data.sites).toEqual([]);
      expect(res.body.data.buildings).toEqual([]);
    });

    it('GET /v1/clients/:id returns 404 for non-existent client', async () => {
      await request(app.getHttpServer())
        .get('/v1/clients/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('PATCH /v1/clients/:id updates a client', async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Before' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/clients/${cRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'After', contactEmail: 'updated@test.com' })
        .expect(200);

      expect(res.body.data.name).toBe('After');
      expect(res.body.data.contactEmail).toBe('updated@test.com');
    });

    it('PATCH /v1/clients/:id returns 409 for duplicate name', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing' });
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other' });

      await request(app.getHttpServer())
        .patch(`/v1/clients/${cRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing' })
        .expect(409);
    });

    it('DELETE /v1/clients/:id removes a client', async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'ToDelete' });

      await request(app.getHttpServer())
        .delete(`/v1/clients/${cRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v1/clients/${cRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── Client ↔ Site Assignment ─────────────────────────────────────────────

  describe('Client-Site Assignment', () => {
    let clientId: string;

    beforeEach(async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Site Client' });
      clientId = cRes.body.data.id;
    });

    it('creates a site with clientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client Site', clientId })
        .expect(201);

      expect(res.body.data.clientId).toBe(clientId);
    });

    it('updates a site to assign a client', async () => {
      const sRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Client Site' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/sites/${sRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId })
        .expect(200);

      expect(res.body.data.clientId).toBe(clientId);
    });

    it('updates a site to unlink client by passing null', async () => {
      const sRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Linked Site', clientId });

      const res = await request(app.getHttpServer())
        .patch(`/v1/sites/${sRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId: null })
        .expect(200);

      expect(res.body.data.clientId).toBeNull();
    });

    it('returns 400 when assigning non-existent client to site', async () => {
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Client Site', clientId: 'non-existent' })
        .expect(400);
    });

    it('GET /v1/sites lists sites with client info', async () => {
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'With Client', clientId });

      const res = await request(app.getHttpServer())
        .get('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const site = res.body.data.find((s: any) => s.name === 'With Client');
      expect(site.client).toMatchObject({ id: clientId, name: 'Site Client' });
    });

    it('GET /v1/clients/:id includes linked sites', async () => {
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Linked Site A', clientId });
      await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Linked Site B', clientId });

      const res = await request(app.getHttpServer())
        .get(`/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.sites).toHaveLength(2);
    });
  });

  // ── Client ↔ Building Assignment ─────────────────────────────────────────

  describe('Client-Building Assignment', () => {
    let clientId: string;

    beforeEach(async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Building Client' });
      clientId = cRes.body.data.id;
    });

    it('creates a standalone building with clientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Standalone Block', clientId })
        .expect(201);

      expect(res.body.data.clientId).toBe(clientId);
      expect(res.body.data.siteId).toBeNull();
    });

    it('rejects clientId on building linked to a site (create)', async () => {
      const sRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Parent Site' });

      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Site Building',
          siteId: sRes.body.data.id,
          clientId,
        })
        .expect(400);
    });

    it('rejects clientId update on building linked to a site', async () => {
      const sRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Parent Site' });
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Site Building', siteId: sRes.body.data.id });

      await request(app.getHttpServer())
        .patch(`/v1/buildings/${bRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId })
        .expect(400);
    });

    it('updates a standalone building to assign a client', async () => {
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Client Block' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/buildings/${bRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId })
        .expect(200);

      expect(res.body.data.clientId).toBe(clientId);
    });

    it('updates a standalone building to unlink client by passing null', async () => {
      const bRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Linked Block', clientId });

      const res = await request(app.getHttpServer())
        .patch(`/v1/buildings/${bRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId: null })
        .expect(200);

      expect(res.body.data.clientId).toBeNull();
    });

    it('GET /v1/buildings lists buildings with client info', async () => {
      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client Block', clientId });

      const res = await request(app.getHttpServer())
        .get('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const building = res.body.data.find(
        (b: any) => b.name === 'Client Block',
      );
      expect(building.client).toMatchObject({
        id: clientId,
        name: 'Building Client',
      });
    });

    it('GET /v1/clients/:id includes linked standalone buildings', async () => {
      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client Block A', clientId });
      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Client Block B', clientId });

      const res = await request(app.getHttpServer())
        .get(`/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.buildings).toHaveLength(2);
    });
  });

  // ── Cross-tenant security ──────────────────────────────────────────────

  describe('Cross-tenant client security', () => {
    it('admin cannot see clients from another org', async () => {
      const cRes = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Org1 Client' });

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

      const otherRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin2@other.com', password: 'Admin1234!' });
      const otherToken = otherRes.body.data.accessToken;

      await request(app.getHttpServer())
        .get(`/v1/clients/${cRes.body.data.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get('/v1/clients')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(listRes.body.data).toHaveLength(0);
    });
  });
});
