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
    .send({ email, password })
    .expect(200);

  return res.body.data.accessToken as string;
}

describe('Building Assignment Verification (e2e)', () => {
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

  async function createInspector(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        password,
        role: 'INSPECTOR',
        firstName: 'Alt',
        lastName: 'Inspector',
      })
      .expect(201);

    const token = await login(app, email, password);
    return { id: res.body.data.id as string, token };
  }

  async function createSite(name: string) {
    const res = await request(app.getHttpServer())
      .post('/v1/sites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name })
      .expect(201);

    return res.body.data.id as string;
  }

  async function createBuilding(name: string, siteId?: string) {
    const res = await request(app.getHttpServer())
      .post('/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(siteId ? { name, siteId } : { name })
      .expect(201);

    return res.body.data.id as string;
  }

  async function createAssignment(buildingId: string, inspectorId = seeds.inspector.id) {
    const res = await request(app.getHttpServer())
      .post('/v1/building-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buildingId, inspectorId })
      .expect(201);

    return res.body.data;
  }

  async function respondToAssignment(
    assignmentId: string,
    token: string,
    status: 'ACCEPTED' | 'REJECTED',
    inspectorNote?: string,
  ) {
    const res = await request(app.getHttpServer())
      .post(`/v1/building-assignments/${assignmentId}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send(inspectorNote ? { status, inspectorNote } : { status })
      .expect(201);

    return res.body.data;
  }

  async function createAcceptedAssignment(buildingId: string) {
    const assignment = await createAssignment(buildingId);
    await respondToAssignment(assignment.id, inspectorToken, 'ACCEPTED');
    return assignment.id as string;
  }

  it('enforces wrong-role access across assignment and workflow endpoints', async () => {
    const buildingId = await createBuilding('Role Guard Building');

    const singleAssignment = await createAssignment(buildingId);

    const groupedSiteId = await createSite('Grouped Role Site');
    await createBuilding('Grouped Role Building A', groupedSiteId);
    await createBuilding('Grouped Role Building B', groupedSiteId);
    const groupedAssignRes = await request(app.getHttpServer())
      .post(`/v1/building-assignments/sites/${groupedSiteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectorId: seeds.inspector.id })
      .expect(201);
    const groupId = groupedAssignRes.body.data.group.id as string;

    await request(app.getHttpServer())
      .post('/v1/building-assignments')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, inspectorId: seeds.inspector.id })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/building-assignments/bulk')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingIds: [buildingId], inspectorId: seeds.inspector.id })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/building-assignments/sites/${groupedSiteId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ inspectorId: seeds.inspector.id })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/building-assignments/buildings/${buildingId}/reassign`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ inspectorId: seeds.inspector.id })
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/building-assignments/history')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/workflow/reopen`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/building-assignments/${singleAssignment.id}/respond`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/building-assignments/groups/${groupId}/respond`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/me/building-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/me/building-assignments/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/workflow/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('covers bulk assignment creation and admin history filtering', async () => {
    const siteId = await createSite('Bulk Site');
    const buildingA = await createBuilding('Bulk A', siteId);
    const buildingB = await createBuilding('Bulk B', siteId);

    const bulkRes = await request(app.getHttpServer())
      .post('/v1/building-assignments/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        buildingIds: [buildingA, buildingB],
        inspectorId: seeds.inspector.id,
        adminNote: 'Bulk dispatch',
      })
      .expect(201);

    expect(bulkRes.body.data.grouped).toBe(true);
    expect(bulkRes.body.data.assignments).toHaveLength(2);
    expect(
      bulkRes.body.data.assignments.every((item: any) => item.status === 'PENDING'),
    ).toBe(true);

    const acceptedAssignment = bulkRes.body.data.assignments.find(
      (item: any) => item.building.id === buildingA,
    );

    await respondToAssignment(
      acceptedAssignment.id,
      inspectorToken,
      'ACCEPTED',
      'Taking this building',
    );

    const pendingHistory = await request(app.getHttpServer())
      .get(
        `/v1/building-assignments/history?siteId=${siteId}&state=PENDING&page=1&limit=1`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(pendingHistory.body.data).toHaveLength(1);
    expect(pendingHistory.body.meta.total).toBe(1);
    expect(pendingHistory.body.data[0].type).toBe('ASSIGNED');
    expect(pendingHistory.body.data[0].site.id).toBe(siteId);

    const acceptedHistory = await request(app.getHttpServer())
      .get(
        `/v1/building-assignments/history?inspectorId=${seeds.inspector.id}&buildingId=${buildingA}&state=ACCEPTED&dateFrom=${encodeURIComponent(
          new Date(Date.now() - 60_000).toISOString(),
        )}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(acceptedHistory.body.data).toHaveLength(1);
    expect(acceptedHistory.body.data[0].type).toBe('ACCEPTED');
    expect(acceptedHistory.body.data[0].building.id).toBe(buildingA);
    expect(acceptedHistory.body.data[0].actor.id).toBe(seeds.inspector.id);
  });

  it('removes the legacy manual planned-survey activation endpoint', async () => {
    const buildingId = await createBuilding('Legacy Activate Removal');
    const plannedSurvey = await prisma.survey.create({
      data: {
        orgId: seeds.org.id,
        buildingId,
        version: 2,
        status: 'PLANNED',
        createdById: seeds.admin.id,
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${plannedSurvey.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('returns assignment advisory data when a new building is added to an already-used site', async () => {
    const siteId = await createSite('Advisory Site');
    const existingBuildingId = await createBuilding('Existing Building', siteId);

    await createAcceptedAssignment(existingBuildingId);

    const res = await request(app.getHttpServer())
      .post('/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Building', siteId })
      .expect(201);

    expect(res.body.data.assignmentAdvisory).toBeDefined();
    expect(res.body.data.assignmentAdvisory.siteId).toBe(siteId);
    expect(res.body.data.assignmentAdvisory.hasExistingAssignments).toBe(true);
    expect(res.body.data.assignmentAdvisory.currentAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildingId: existingBuildingId,
          inspectorId: seeds.inspector.id,
          status: 'ACCEPTED',
        }),
      ]),
    );
    expect(res.body.data.assignmentAdvisory.suggestedInspectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: seeds.inspector.id }),
      ]),
    );
  });

  it('keeps workflow locked after single rejection', async () => {
    const buildingId = await createBuilding('Rejected Building');
    const assignment = await createAssignment(buildingId);

    const rejection = await respondToAssignment(
      assignment.id,
      inspectorToken,
      'REJECTED',
      'Cannot take this site',
    );
    expect(rejection.status).toBe('REJECTED');

    const floorRes = await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buildingId, label: 'Ground' })
      .expect(201);
    const floorId = floorRes.body.data.id as string;

    const doorRes = await request(app.getHttpServer())
      .post('/v1/doors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ floorId, code: 'RJ-101' })
      .expect(201);
    const doorId = doorRes.body.data.id as string;

    await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/approve`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Blocked' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/doors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ floorId, code: 'RJ-102' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/signed-upload`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ role: 'FRONT_FACE' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/submit`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);
  });

  it('supports grouped rejection and removes all grouped building access', async () => {
    const siteId = await createSite('Reject Group Site');
    const buildingA = await createBuilding('Reject Group A', siteId);
    const buildingB = await createBuilding('Reject Group B', siteId);

    const groupedAssignRes = await request(app.getHttpServer())
      .post(`/v1/building-assignments/sites/${siteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectorId: seeds.inspector.id })
      .expect(201);
    const groupId = groupedAssignRes.body.data.group.id as string;

    const rejection = await request(app.getHttpServer())
      .post(`/v1/building-assignments/groups/${groupId}/respond`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ status: 'REJECTED', inspectorNote: 'Rejecting full site bundle' })
      .expect(201);

    expect(rejection.body.data.status).toBe('REJECTED');
    expect(rejection.body.data.assignments).toHaveLength(2);

    const myAssignments = await request(app.getHttpServer())
      .get('/v1/me/building-assignments')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    expect(myAssignments.body.data.pending).toEqual([]);
    expect(myAssignments.body.data.accepted).toEqual([]);

    await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingA}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingB}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404);
  });

  it('verifies accepted inspector floor, door, image, approval, and own-upload deletion flow', async () => {
    const buildingId = await createBuilding('Workflow Assets Building');
    await createAcceptedAssignment(buildingId);

    const floorRes = await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Ground' })
      .expect(201);
    const floorId = floorRes.body.data.id as string;

    const doorRes = await request(app.getHttpServer())
      .post('/v1/doors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ floorId, code: 'WF-101', locationNotes: 'Lobby entrance' })
      .expect(201);
    const doorId = doorRes.body.data.id as string;

    const uploadRes = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/signed-upload`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ role: 'FRONT_FACE' })
      .expect(200);

    expect(uploadRes.body.data.signedUrl).toContain('https://mock-gcs.local/upload/');

    const registerRes = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/register`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({
        imageId: uploadRes.body.data.imageId,
        objectPath: uploadRes.body.data.objectPath,
        objectPathThumb: `${uploadRes.body.data.objectPath}.thumb.jpg`,
        role: 'FRONT_FACE',
      })
      .expect(201);
    const firstImageId = registerRes.body.data.id as string;

    const batchUploadRes = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/signed-upload/batch`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({
        images: [{ role: 'REAR_FACE' }, { role: 'HINGES' }],
      })
      .expect(200);

    expect(batchUploadRes.body.data).toHaveLength(2);

    const batchRegisterRes = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/register/batch`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({
        images: batchUploadRes.body.data.map((item: any) => ({
          imageId: item.imageId,
          objectPath: item.objectPath,
          objectPathThumb: `${item.objectPath}.thumb.jpg`,
          role: item.role,
        })),
      })
      .expect(201);

    expect(batchRegisterRes.body.data).toHaveLength(2);

    const listRes = await request(app.getHttpServer())
      .get(`/v1/doors/${doorId}/images`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(3);

    await request(app.getHttpServer())
      .get(`/v1/doors/${doorId}/images/${firstImageId}/signed-download`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    const adminImage = await prisma.doorImage.create({
      data: {
        doorId,
        role: 'OTHER',
        label: 'Admin evidence',
        objectPathOriginal: 'mock/admin-image.jpg',
        objectPathThumb: 'mock/admin-image-thumb.jpg',
        uploadedById: seeds.admin.id,
      },
    });

    const ownImageIds = listRes.body.data.map((item: any) => item.id);

    await request(app.getHttpServer())
      .delete(`/v1/doors/${doorId}/images/bulk`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ imageIds: [ownImageIds[0], adminImage.id] })
      .expect(403);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/doors/${doorId}/images/bulk`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ imageIds: ownImageIds })
      .expect(200);

    expect(deleteRes.body.data.deleted).toBe(3);

    const afterDelete = await request(app.getHttpServer())
      .get(`/v1/doors/${doorId}/images`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    expect(afterDelete.body.data).toHaveLength(1);
    expect(afterDelete.body.data[0].id).toBe(adminImage.id);
  });

  it('verifies certificate downloads plus workflow complete and reopen behavior end to end', async () => {
    const otherInspector = await createInspector(
      'download.other@test.com',
      'DownloadPass1234!',
    );

    const buildingId = await createBuilding('Certificate Workflow Building');
    await createAcceptedAssignment(buildingId);

    const floorRes = await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Ground' })
      .expect(201);
    const floorId = floorRes.body.data.id as string;

    const doorRes = await request(app.getHttpServer())
      .post('/v1/doors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ floorId, code: 'CF-101' })
      .expect(201);
    const doorId = doorRes.body.data.id as string;

    const imageUploadRes = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/signed-upload`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ role: 'FRONT_FACE' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/images/register`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({
        imageId: imageUploadRes.body.data.imageId,
        objectPath: imageUploadRes.body.data.objectPath,
        objectPathThumb: `${imageUploadRes.body.data.objectPath}.thumb.jpg`,
        role: 'FRONT_FACE',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/submit`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    const doorCertUpload = await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/certificate/signed-upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/doors/${doorId}/certificate/register`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        certId: doorCertUpload.body.data.certId,
        objectPath: doorCertUpload.body.data.objectPath,
      })
      .expect(201);

    const survey = await prisma.survey.findFirstOrThrow({
      where: { buildingId },
      orderBy: { createdAt: 'desc' },
    });

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    const buildingAfterComplete = await prisma.building.findUniqueOrThrow({
      where: { id: buildingId },
    });
    expect(buildingAfterComplete.status).toBe('APPROVED');
    expect(buildingAfterComplete.approvedById).toBe(seeds.inspector.id);

    const doorCertDownload = await request(app.getHttpServer())
      .get(`/v1/doors/${doorId}/certificate/signed-download`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    expect(doorCertDownload.body.data.signedUrl).toContain(
      'https://mock-gcs.local/download/',
    );

    await request(app.getHttpServer())
      .get(`/v1/doors/${doorId}/certificate/signed-download`)
      .set('Authorization', `Bearer ${otherInspector.token}`)
      .expect(404);

    const buildingCertUpload = await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/certificate/signed-upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/certificate/register`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        certId: buildingCertUpload.body.data.certId,
        objectPath: buildingCertUpload.body.data.objectPath,
      })
      .expect(201);

    const buildingCertDownload = await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingId}/certificate/signed-download`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    expect(buildingCertDownload.body.data.signedUrl).toContain(
      'https://mock-gcs.local/download/',
    );

    await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingId}/certificate/signed-download`)
      .set('Authorization', `Bearer ${otherInspector.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/buildings/${buildingId}/surveys/${survey.id}/certificate/signed-download`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/buildings/${buildingId}/certificate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${survey.id}/reopen-fieldwork`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Blocked after complete' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/buildings/${buildingId}/surveys/${survey.id}/reopen-fieldwork`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Allowed after reopen' })
      .expect(201);
  });
});
