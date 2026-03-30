import { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
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

describe('Building Assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeds: TestSeeds;
  let adminToken: string;
  let inspectorToken: string;
  let notifications: NotificationsService;
  let notifyUsersSpy: jest.SpiedFunction<NotificationsService['notifyUsers']>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
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

    notifyUsersSpy = jest
      .spyOn(notifications, 'notifyUsers')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    notifyUsersSpy.mockRestore();
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

  async function createAcceptedBuilding(name: string) {
    const buildingRes = await request(app.getHttpServer())
      .post('/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name })
      .expect(201);
    const buildingId = buildingRes.body.data.id as string;

    const assignmentRes = await request(app.getHttpServer())
      .post('/v1/building-assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ buildingId, inspectorId: seeds.inspector.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/building-assignments/${assignmentRes.body.data.id}/respond`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(201);

    return {
      buildingId,
      assignmentId: assignmentRes.body.data.id as string,
    };
  }

  async function bootstrapActiveSurvey(buildingId: string) {
    await request(app.getHttpServer())
      .post('/v1/floors')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ buildingId, label: 'Ground' })
      .expect(201);

    return prisma.survey.findFirstOrThrow({
      where: { buildingId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function setupCompletableActiveSurvey(name: string) {
    const { buildingId, assignmentId } = await createAcceptedBuilding(name);
    const survey = await bootstrapActiveSurvey(buildingId);

    const floor = await prisma.floor.findFirstOrThrow({
      where: { buildingId, surveyId: survey.id },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const door = await prisma.door.create({
      data: {
        floorId: floor.id,
        code: `D-${Date.now()}`,
        locationNotes: 'Completion fixture',
        status: 'CERTIFIED',
        submittedAt: now,
        submittedById: seeds.inspector.id,
        certifiedAt: now,
        certifiedById: seeds.admin.id,
        createdById: seeds.inspector.id,
      },
    });

    await prisma.doorImage.create({
      data: {
        doorId: door.id,
        role: 'FRONT_FACE',
        objectPathOriginal: `orgs/${seeds.org.id}/doors/${door.id}/image.jpg`,
        uploadedById: seeds.inspector.id,
      },
    });

    await prisma.doorCertificate.create({
      data: {
        doorId: door.id,
        objectPathCertificate: `orgs/${seeds.org.id}/doors/${door.id}/cert.pdf`,
        uploadedById: seeds.admin.id,
      },
    });

    await prisma.buildingCertificate.create({
      data: {
        buildingId,
        surveyId: survey.id,
        objectPathCertificate: `orgs/${seeds.org.id}/buildings/${buildingId}/cert.pdf`,
        uploadedById: seeds.admin.id,
      },
    });

    await prisma.building.update({
      where: { id: buildingId },
      data: {
        status: 'CERTIFIED',
        approvedAt: now,
        approvedById: seeds.inspector.id,
        certifiedAt: now,
        certifiedById: seeds.admin.id,
      },
    });

    return {
      buildingId,
      assignmentId,
      surveyId: survey.id,
      floorId: floor.id,
      doorId: door.id,
    };
  }

  async function createSurveyDoor(
    buildingId: string,
    surveyId: string,
    status: 'DRAFT' | 'SUBMITTED' | 'CERTIFIED',
    code = `D-${Date.now()}`,
  ) {
    const floor = await prisma.floor.findFirstOrThrow({
      where: { buildingId, surveyId },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    return prisma.door.create({
      data: {
        floorId: floor.id,
        code,
        locationNotes: 'Workflow fixture',
        status,
        submittedAt: status === 'DRAFT' ? null : now,
        submittedById: status === 'DRAFT' ? null : seeds.inspector.id,
        certifiedAt: status === 'CERTIFIED' ? now : null,
        certifiedById: status === 'CERTIFIED' ? seeds.admin.id : null,
        createdById: seeds.inspector.id,
      },
    });
  }

  async function seedCompletedSurveyTemplate(name: string) {
    const buildingRes = await request(app.getHttpServer())
      .post('/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name })
      .expect(201);
    const buildingId = buildingRes.body.data.id as string;

    const now = new Date();
    await prisma.building.update({
      where: { id: buildingId },
      data: {
        status: 'CERTIFIED',
        approvedAt: now,
        approvedById: seeds.inspector.id,
        certifiedAt: now,
        certifiedById: seeds.admin.id,
      },
    });

    const completedSurvey = await prisma.survey.create({
      data: {
        orgId: seeds.org.id,
        buildingId,
        version: 1,
        status: 'COMPLETED',
        createdById: seeds.admin.id,
        startedAt: new Date(now.getTime() - 10_000),
        completedAt: now,
      },
    });

    const floor = await prisma.floor.create({
      data: {
        buildingId,
        surveyId: completedSurvey.id,
        label: 'Ground',
        notes: 'Template floor',
        createdById: seeds.admin.id,
      },
    });

    const door = await prisma.door.create({
      data: {
        floorId: floor.id,
        code: 'T-001',
        locationNotes: 'Template door',
        status: 'CERTIFIED',
        submittedAt: now,
        submittedById: seeds.inspector.id,
        certifiedAt: now,
        certifiedById: seeds.admin.id,
        createdById: seeds.admin.id,
      },
    });

    await prisma.doorImage.create({
      data: {
        doorId: door.id,
        role: 'FRONT_FACE',
        objectPathOriginal: `orgs/${seeds.org.id}/doors/${door.id}/template.jpg`,
        uploadedById: seeds.inspector.id,
      },
    });

    await prisma.doorCertificate.create({
      data: {
        doorId: door.id,
        objectPathCertificate: `orgs/${seeds.org.id}/doors/${door.id}/template-cert.pdf`,
        uploadedById: seeds.admin.id,
      },
    });

    await prisma.buildingCertificate.create({
      data: {
        buildingId,
        surveyId: completedSurvey.id,
        objectPathCertificate: `orgs/${seeds.org.id}/buildings/${buildingId}/template-cert.pdf`,
        uploadedById: seeds.admin.id,
      },
    });

    return {
      buildingId,
      completedSurveyId: completedSurvey.id,
      completedFloorId: floor.id,
      completedDoorId: door.id,
    };
  }

  describe('Acceptance gating', () => {
    it('keeps workflow locked until the inspector accepts the assignment', async () => {
      const buildingRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Assigned Building' })
        .expect(201);
      const buildingId = buildingRes.body.data.id as string;

      const assignmentRes = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buildingId, inspectorId: seeds.inspector.id })
        .expect(201);

      expect(assignmentRes.body.data.status).toBe('PENDING');

      const myAssignments = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(myAssignments.body.data.pending).toHaveLength(1);
      expect(myAssignments.body.data.pending[0].workflow).toBeNull();
      expect(myAssignments.body.data.accepted).toEqual([]);

      await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'G' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${assignmentRes.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'G' })
        .expect(201);
    });
  });

  describe('Grouped site assignment', () => {
    it('creates one grouped invitation for current site buildings and accepts them together', async () => {
      const siteRes = await request(app.getHttpServer())
        .post('/v1/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Grouped Site' })
        .expect(201);
      const siteId = siteRes.body.data.id as string;

      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Block A', siteId })
        .expect(201);
      await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Block B', siteId })
        .expect(201);

      const assignRes = await request(app.getHttpServer())
        .post(`/v1/building-assignments/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: seeds.inspector.id })
        .expect(201);

      expect(assignRes.body.data.grouped).toBe(true);
      expect(assignRes.body.data.assignments).toHaveLength(2);
      const groupId = assignRes.body.data.group.id as string;

      const pendingRes = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(pendingRes.body.data.pending).toHaveLength(2);
      expect(
        new Set(
          pendingRes.body.data.pending.map((item: any) => item.group?.id),
        ).size,
      ).toBe(1);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/groups/${groupId}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const acceptedRes = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(acceptedRes.body.data.pending).toEqual([]);
      expect(acceptedRes.body.data.accepted).toHaveLength(2);
      expect(acceptedRes.body.data.accepted[0].group.grouped).toBe(true);
    });
  });

  describe('Reassignment continuity', () => {
    it('removes old inspector access immediately and lets the new inspector continue existing progress', async () => {
      const otherInspector = await createInspector(
        'other.inspector@test.com',
        'OtherPass1234!',
      );

      const buildingRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Continuity Building' })
        .expect(201);
      const buildingId = buildingRes.body.data.id as string;

      const assignmentRes = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buildingId, inspectorId: seeds.inspector.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${assignmentRes.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const floorRes = await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'Ground' })
        .expect(201);

      expect(floorRes.body.data.label).toBe('Ground');

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/buildings/${buildingId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: otherInspector.id })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'Blocked' })
        .expect(403);

      const pendingForNew = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${otherInspector.token}`)
        .expect(200);

      const newAssignmentId = pendingForNew.body.data.pending[0].id as string;

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${newAssignmentId}/respond`)
        .set('Authorization', `Bearer ${otherInspector.token}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const floorsRes = await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}/floors`)
        .set('Authorization', `Bearer ${otherInspector.token}`)
        .expect(200);

      expect(floorsRes.body.data).toHaveLength(1);
      expect(floorsRes.body.data[0].label).toBe('Ground');
    });
  });

  describe('Complete and reopen workflow', () => {
    it('uses survey execution state as the canonical fieldwork lock for survey endpoints', async () => {
      const { buildingId } = await createAcceptedBuilding('Workflow Building');
      const survey = await bootstrapActiveSurvey(buildingId);
      await createSurveyDoor(buildingId, survey.id, 'SUBMITTED', 'WF-101');

      const completeRes = await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(completeRes.body.data.executionStatus).toBe(
        'INSPECTOR_COMPLETED',
      );
      expect(completeRes.body.data.workflow.status).toBe('COMPLETED');

      const completedSurvey = await prisma.survey.findUniqueOrThrow({
        where: { id: survey.id },
      });
      expect(completedSurvey.executionStatus).toBe('INSPECTOR_COMPLETED');
      expect(completedSurvey.inspectorCompletedById).toBe(seeds.inspector.id);

      const buildingAfterComplete = await prisma.building.findUniqueOrThrow({
        where: { id: buildingId },
      });
      expect(buildingAfterComplete.status).toBe('APPROVED');
      expect(buildingAfterComplete.approvedById).toBe(seeds.inspector.id);

      await prisma.buildingWorkflowState.update({
        where: { buildingId },
        data: {
          status: 'ACTIVE',
          completedAt: null,
          completedById: null,
          reopenedAt: null,
          reopenedById: null,
        },
      });

      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'Blocked after complete' })
        .expect(403);

      const lockedBuilding = await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(lockedBuilding.body.data.workflowExecution.status).toBe(
        'COMPLETED',
      );

      const reopenRes = await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(reopenRes.body.data.executionStatus).toBe('IN_PROGRESS');
      expect(reopenRes.body.data.workflow.status).toBe('ACTIVE');

      const reopenedSurvey = await prisma.survey.findUniqueOrThrow({
        where: { id: survey.id },
      });
      expect(reopenedSurvey.executionStatus).toBe('IN_PROGRESS');
      expect(reopenedSurvey.reopenedById).toBe(seeds.admin.id);

      const buildingAfterReopen = await prisma.building.findUniqueOrThrow({
        where: { id: buildingId },
      });
      expect(buildingAfterReopen.status).toBe('DRAFT');
      expect(buildingAfterReopen.approvedAt).toBeNull();
      expect(buildingAfterReopen.approvedById).toBeNull();

      await prisma.buildingWorkflowState.update({
        where: { buildingId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: seeds.admin.id,
        },
      });

      const reopenedBuilding = await request(app.getHttpServer())
        .get(`/v1/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(reopenedBuilding.body.data.workflowExecution.status).toBe(
        'ACTIVE',
      );

      await request(app.getHttpServer())
        .post('/v1/floors')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ buildingId, label: 'Allowed after reopen' })
        .expect(201);
    });

    it('blocks fieldwork completion when the active survey has no doors', async () => {
      const { buildingId } = await createAcceptedBuilding('No Doors Building');
      const survey = await bootstrapActiveSurvey(buildingId);

      const res = await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(400);

      expect(res.body.message).toContain(
        'At least one door must exist in the active survey before fieldwork can be completed',
      );

      const surveyAfter = await prisma.survey.findUniqueOrThrow({
        where: { id: survey.id },
      });
      expect(surveyAfter.executionStatus).toBe('IN_PROGRESS');
    });

    it('blocks fieldwork completion when any door is still in DRAFT', async () => {
      const { buildingId } = await createAcceptedBuilding('Draft Door Building');
      const survey = await bootstrapActiveSurvey(buildingId);

      await createSurveyDoor(buildingId, survey.id, 'SUBMITTED', 'WF-SUB');
      await createSurveyDoor(buildingId, survey.id, 'DRAFT', 'WF-DRAFT');

      const res = await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(400);

      expect(res.body.message).toContain(
        'All doors must be submitted before completing fieldwork',
      );
      expect(res.body.message).toContain('WF-DRAFT');

      const buildingAfter = await prisma.building.findUniqueOrThrow({
        where: { id: buildingId },
      });
      expect(buildingAfter.status).toBe('DRAFT');
    });

    it('reopening a submitted door after fieldwork completion also reopens the active survey', async () => {
      const { buildingId } = await createAcceptedBuilding(
        'Door Reopen Reopens Survey',
      );
      const survey = await bootstrapActiveSurvey(buildingId);
      const door = await createSurveyDoor(
        buildingId,
        survey.id,
        'SUBMITTED',
        'REOPEN-101',
      );

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const reopenRes = await request(app.getHttpServer())
        .post(`/v1/doors/${door.id}/reopen`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(reopenRes.body.data.status).toBe('DRAFT');

      const surveyAfter = await prisma.survey.findUniqueOrThrow({
        where: { id: survey.id },
      });
      expect(surveyAfter.executionStatus).toBe('IN_PROGRESS');
      expect(surveyAfter.reopenedById).toBe(seeds.admin.id);

      const buildingAfter = await prisma.building.findUniqueOrThrow({
        where: { id: buildingId },
      });
      expect(buildingAfter.status).toBe('DRAFT');

      await request(app.getHttpServer())
        .post(`/v1/doors/${door.id}/images/signed-upload`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ role: 'FRONT_FACE' })
        .expect(200);
    });

    it('requires deleting the building certificate before reopening fieldwork or removing a door certificate', async () => {
      const setup = await setupCompletableActiveSurvey(
        'Building Certificate Must Be Removed First',
      );

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const reopenRes = await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expect(reopenRes.body.message).toContain(
        'Delete the building certificate before reopening fieldwork',
      );

      const deleteDoorCertRes = await request(app.getHttpServer())
        .delete(`/v1/doors/${setup.doorId}/certificate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expect(deleteDoorCertRes.body.message).toContain(
        'Delete the building certificate before deleting a door certificate',
      );

      await request(app.getHttpServer())
        .delete(`/v1/buildings/${setup.buildingId}/certificate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/v1/doors/${setup.doorId}/certificate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const doorAfter = await prisma.door.findUniqueOrThrow({
        where: { id: setup.doorId },
      });
      expect(doorAfter.status).toBe('SUBMITTED');

      await request(app.getHttpServer())
        .post(`/v1/doors/${setup.doorId}/reopen`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const surveyAfter = await prisma.survey.findUniqueOrThrow({
        where: { id: setup.surveyId },
      });
      expect(surveyAfter.executionStatus).toBe('IN_PROGRESS');
    });

    it('blocks the wrong role on the new survey fieldwork endpoints', async () => {
      const { buildingId } = await createAcceptedBuilding('Role Guard Building');
      const survey = await bootstrapActiveSurvey(buildingId);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('blocks wrong-survey and non-active survey fieldwork requests', async () => {
      const primary = await createAcceptedBuilding('Primary Survey Building');
      const activeSurvey = await bootstrapActiveSurvey(primary.buildingId);

      const secondary = await createAcceptedBuilding('Secondary Survey Building');
      const otherActiveSurvey = await bootstrapActiveSurvey(secondary.buildingId);

      const completedSurvey = await prisma.survey.create({
        data: {
          orgId: seeds.org.id,
          buildingId: primary.buildingId,
          version: activeSurvey.version + 1,
          status: 'COMPLETED',
          startedAt: new Date(),
          completedAt: new Date(),
          createdById: seeds.admin.id,
        },
      });

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${primary.buildingId}/surveys/${otherActiveSurvey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${primary.buildingId}/surveys/${completedSurvey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${primary.buildingId}/surveys/${completedSurvey.id}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

  });

  describe('Planned next survey lifecycle', () => {
    it('start-next creates PLANNED survey with structure-only cloning and blocks a second planned survey', async () => {
      const seeded = await seedCompletedSurveyTemplate('Start Next Planned Building');

      const beforeBuilding = await prisma.building.findUniqueOrThrow({
        where: { id: seeded.buildingId },
      });

      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nextScheduledAt: '2027-01-01T09:00:00.000Z',
          nextScheduledNote: 'Planned cycle',
        })
        .expect(201);

      expect(startRes.body.data.status).toBe('PLANNED');
      const plannedSurveyId = startRes.body.data.id as string;

      const activeSurvey = await prisma.survey.findFirst({
        where: { buildingId: seeded.buildingId, status: 'ACTIVE' },
      });
      expect(activeSurvey).toBeNull();

      const plannedSurvey = await prisma.survey.findUniqueOrThrow({
        where: { id: plannedSurveyId },
        include: {
          floors: {
            include: {
              doors: {
                include: {
                  images: true,
                  certificate: true,
                },
              },
            },
          },
          buildingCertificate: true,
        },
      });

      expect(plannedSurvey.status).toBe('PLANNED');
      expect(plannedSurvey.floors).toHaveLength(1);
      expect(plannedSurvey.floors[0].doors).toHaveLength(1);
      expect(plannedSurvey.floors[0].doors[0].status).toBe('DRAFT');
      expect(plannedSurvey.floors[0].doors[0].submittedAt).toBeNull();
      expect(plannedSurvey.floors[0].doors[0].certifiedAt).toBeNull();
      expect(plannedSurvey.floors[0].doors[0].images).toHaveLength(0);
      expect(plannedSurvey.floors[0].doors[0].certificate).toBeNull();
      expect(plannedSurvey.buildingCertificate).toBeNull();

      const afterBuilding = await prisma.building.findUniqueOrThrow({
        where: { id: seeded.buildingId },
      });
      expect(afterBuilding.status).toBe(beforeBuilding.status);
      expect(afterBuilding.approvedAt).not.toBeNull();
      expect(afterBuilding.certifiedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('confirm-complete without scheduling creates no next survey and closes current assignments', async () => {
      const setup = await setupCompletableActiveSurvey('Complete Without Schedule');

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const confirmRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      expect(confirmRes.body.data.status).toBe('COMPLETED');
      expect(confirmRes.body.data.plannedNextSurvey).toBeNull();

      const plannedSurveys = await prisma.survey.findMany({
        where: { buildingId: setup.buildingId, status: 'PLANNED' },
      });
      expect(plannedSurveys).toHaveLength(0);

      const closedAssignment = await prisma.buildingAssignment.findUniqueOrThrow({
        where: { id: setup.assignmentId },
      });
      expect(closedAssignment.status).toBe('REMOVED');
      expect(closedAssignment.accessEndedAt).not.toBeNull();

      const myAssignments = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(myAssignments.body.data.pending).toEqual([]);
      expect(myAssignments.body.data.accepted).toEqual([]);
    });

    it('confirm-complete with scheduling creates a planned next survey with structure-only door cloning', async () => {
      const setup = await setupCompletableActiveSurvey('Complete With Schedule');
      const scheduledAt = '2027-02-15T08:30:00.000Z';

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const confirmRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nextScheduledAt: scheduledAt,
          nextScheduledNote: 'Annual cycle',
          nextAssignedInspectorId: seeds.inspector.id,
        })
        .expect(200);

      expect(confirmRes.body.data.status).toBe('COMPLETED');
      expect(confirmRes.body.data.plannedNextSurvey).toBeTruthy();
      expect(confirmRes.body.data.plannedNextSurvey.status).toBe('PLANNED');

      const plannedSurvey = await prisma.survey.findFirstOrThrow({
        where: { buildingId: setup.buildingId, status: 'PLANNED' },
        include: {
          floors: {
            include: {
              doors: {
                include: {
                  images: true,
                  certificate: true,
                },
              },
            },
          },
          buildingCertificate: true,
        },
      });
      expect(plannedSurvey.scheduledStartAt?.toISOString()).toBe(scheduledAt);
      expect(plannedSurvey.nextScheduledAt?.toISOString()).toBe(scheduledAt);
      expect(plannedSurvey.nextAssignedInspectorId).toBe(seeds.inspector.id);
      expect(plannedSurvey.floors).toHaveLength(1);
      expect(plannedSurvey.floors[0].doors).toHaveLength(1);
      expect(plannedSurvey.floors[0].doors[0].code).toBeDefined();
      expect(plannedSurvey.floors[0].doors[0].status).toBe('DRAFT');
      expect(plannedSurvey.floors[0].doors[0].submittedAt).toBeNull();
      expect(plannedSurvey.floors[0].doors[0].certifiedAt).toBeNull();
      expect(plannedSurvey.floors[0].doors[0].images).toHaveLength(0);
      expect(plannedSurvey.floors[0].doors[0].certificate).toBeNull();
      expect(plannedSurvey.buildingCertificate).toBeNull();

      const plannedAssignmentCount = await prisma.buildingAssignment.count({
        where: { buildingId: setup.buildingId, surveyId: plannedSurvey.id, accessEndedAt: null },
      });
      expect(plannedAssignmentCount).toBe(0);
    });

    it('blocks building certificate upload/register until survey fieldwork is completed and allows after completion', async () => {
      const setup = await setupCompletableActiveSurvey('Certificate Fieldwork Gate');

      await prisma.buildingWorkflowState.update({
        where: { buildingId: setup.buildingId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: seeds.admin.id,
        },
      });

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/certificate/signed-upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/certificate/register`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          certId: 'phase4-blocked-cert',
          objectPath: `orgs/${seeds.org.id}/buildings/${setup.buildingId}/blocked-cert.pdf`,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const certUpload = await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/certificate/signed-upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/certificate/register`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          certId: certUpload.body.data.certId,
          objectPath: certUpload.body.data.objectPath,
        })
        .expect(201);
    });

    it('blocks building certificate upload/register until all active-survey doors are certified', async () => {
      const { buildingId } = await createAcceptedBuilding(
        'Door Certificate Gate',
      );
      const survey = await bootstrapActiveSurvey(buildingId);
      await createSurveyDoor(buildingId, survey.id, 'SUBMITTED', 'CERT-SUB');

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const uploadRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${buildingId}/certificate/signed-upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(uploadRes.body.message).toContain(
        'All doors must be certified before requesting a building certificate upload',
      );
      expect(uploadRes.body.message).toContain('CERT-SUB');

      const registerRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${buildingId}/certificate/register`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          certId: 'forced-cert-id',
          objectPath: `orgs/${seeds.org.id}/buildings/${buildingId}/forced-cert.pdf`,
        })
        .expect(400);

      expect(registerRes.body.message).toContain(
        'All doors must be certified before registering a building certificate',
      );
      expect(registerRes.body.message).toContain('CERT-SUB');
    });

    it('confirm-complete requires survey fieldwork completion and still requires a certificate', async () => {
      const setup = await setupCompletableActiveSurvey('Completion Prereq Gate');

      await prisma.buildingWorkflowState.update({
        where: { buildingId: setup.buildingId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: seeds.admin.id,
        },
      });

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await prisma.buildingCertificate.deleteMany({
        where: { surveyId: setup.surveyId },
      });

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('confirm-complete rejects a forced zero-door survey state', async () => {
      const { buildingId } = await createAcceptedBuilding('Zero Door Complete');
      const survey = await bootstrapActiveSurvey(buildingId);
      const now = new Date();

      await prisma.survey.update({
        where: { id: survey.id },
        data: {
          executionStatus: 'INSPECTOR_COMPLETED',
          inspectorCompletedAt: now,
          inspectorCompletedById: seeds.inspector.id,
        },
      });

      await prisma.buildingCertificate.create({
        data: {
          buildingId,
          surveyId: survey.id,
          objectPathCertificate: `orgs/${seeds.org.id}/buildings/${buildingId}/zero-door-cert.pdf`,
          uploadedById: seeds.admin.id,
        },
      });

      await prisma.building.update({
        where: { id: buildingId },
        data: {
          status: 'CERTIFIED',
          approvedAt: now,
          approvedById: seeds.inspector.id,
          certifiedAt: now,
          certifiedById: seeds.admin.id,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/buildings/${buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain(
        'At least one door must exist in the active survey before confirming completion',
      );
    });

    it('activation endpoint is admin-only, requires accepted survey-linked assignment, and resets building status on activation', async () => {
      const seeded = await seedCompletedSurveyTemplate('Activation Building');
      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nextScheduledAt: '2027-03-01T09:00:00.000Z' })
        .expect(201);
      const plannedSurveyId = startRes.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/${plannedSurveyId}/activate`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/${plannedSurveyId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      const pendingAssignment = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: seeded.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurveyId,
        })
        .expect(201);
      expect(pendingAssignment.body.data.surveyId).toBe(plannedSurveyId);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/${plannedSurveyId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${pendingAssignment.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const activated = await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/${plannedSurveyId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(activated.body.data.status).toBe('ACTIVE');
      expect(activated.body.data.executionStatus).toBe('IN_PROGRESS');
      expect(activated.body.data.activatedById).toBe(seeds.admin.id);
      expect(activated.body.data.activatedAt).toBeTruthy();

      const activatedSurvey = await prisma.survey.findUniqueOrThrow({
        where: { id: plannedSurveyId },
      });
      expect(activatedSurvey.status).toBe('ACTIVE');

      const buildingAfterActivate = await prisma.building.findUniqueOrThrow({
        where: { id: seeded.buildingId },
      });
      expect(buildingAfterActivate.status).toBe('DRAFT');
      expect(buildingAfterActivate.approvedAt).toBeNull();
      expect(buildingAfterActivate.approvedById).toBeNull();
      expect(buildingAfterActivate.certifiedAt).toBeNull();
      expect(buildingAfterActivate.certifiedById).toBeNull();
    });

    it('planned survey stays non-editable before activation', async () => {
      const seeded = await seedCompletedSurveyTemplate('Planned Lock Building');
      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${seeded.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);
      const plannedSurveyId = startRes.body.data.id as string;

      const plannedFloor = await prisma.floor.findFirstOrThrow({
        where: { buildingId: seeded.buildingId, surveyId: plannedSurveyId },
        orderBy: { createdAt: 'asc' },
      });
      const plannedDoor = await prisma.door.findFirstOrThrow({
        where: { floorId: plannedFloor.id },
      });

      await request(app.getHttpServer())
        .post('/v1/doors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ floorId: plannedFloor.id, code: 'LOCK-1' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/doors/${plannedDoor.id}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('supports same-building survey-linked assignment for planned next version without false conflict', async () => {
      const setup = await setupCompletableActiveSurvey('Same Building Next Version');
      const scheduledAt = '2027-04-20T10:00:00.000Z';

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nextScheduledAt: scheduledAt })
        .expect(200);

      const plannedSurvey = await prisma.survey.findFirstOrThrow({
        where: { buildingId: setup.buildingId, status: 'PLANNED' },
      });

      const myAssignmentsAfterCompletion = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);
      expect(myAssignmentsAfterCompletion.body.data.pending).toEqual([]);
      expect(myAssignmentsAfterCompletion.body.data.accepted).toEqual([]);

      const plannedAssignment = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: setup.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurvey.id,
        })
        .expect(201);
      expect(plannedAssignment.body.data.surveyId).toBe(plannedSurvey.id);

      await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: setup.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurvey.id,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${plannedAssignment.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const myAssignmentsAfterAccept = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(myAssignmentsAfterAccept.body.data.pending).toEqual([]);
      expect(myAssignmentsAfterAccept.body.data.accepted).toHaveLength(1);
      expect(myAssignmentsAfterAccept.body.data.accepted[0].surveyId).toBe(
        plannedSurvey.id,
      );
    });
  });

  describe('History APIs', () => {
    it('returns inspector and admin history with actor and state information', async () => {
      const { buildingId } = await createAcceptedBuilding('History Building');
      const survey = await bootstrapActiveSurvey(buildingId);
      await createSurveyDoor(buildingId, survey.id, 'SUBMITTED', 'HIST-101');

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${buildingId}/surveys/${survey.id}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const inspectorHistory = await request(app.getHttpServer())
        .get('/v1/me/building-assignments/history')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const inspectorTypes = inspectorHistory.body.data.map(
        (item: any) => item.type,
      );
      expect(inspectorTypes).toEqual(
        expect.arrayContaining([
          'ASSIGNED',
          'ACCEPTED',
          'BUILDING_COMPLETED',
          'BUILDING_REOPENED',
        ]),
      );
      expect(inspectorHistory.body.data[0].actor).toBeDefined();

      const adminHistory = await request(app.getHttpServer())
        .get('/v1/building-assignments/history?state=REOPENED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(adminHistory.body.data).toHaveLength(1);
      expect(adminHistory.body.data[0].type).toBe('BUILDING_REOPENED');
      expect(adminHistory.body.data[0].building.id).toBe(buildingId);
    });
  });

  describe('Phase 5 mobile contract and notifications', () => {
    it('includes survey metadata in pending/accepted assignment lists and distinguishes planned from active work', async () => {
      const active = await createAcceptedBuilding('Mobile Active Work');
      const activeSurvey = await bootstrapActiveSurvey(active.buildingId);

      const plannedTemplate = await seedCompletedSurveyTemplate('Mobile Planned Work');
      const plannedAt = '2027-05-01T09:00:00.000Z';
      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${plannedTemplate.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nextScheduledAt: plannedAt })
        .expect(201);
      const plannedSurveyId = startRes.body.data.id as string;
      const plannedSurveyVersion = startRes.body.data.version as number;

      const plannedAssignment = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: plannedTemplate.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurveyId,
        })
        .expect(201);

      const mineWithPending = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const pendingPlanned = mineWithPending.body.data.pending.find(
        (item: any) => item.id === plannedAssignment.body.data.id,
      );
      expect(pendingPlanned).toBeDefined();
      expect(pendingPlanned.surveyId).toBe(plannedSurveyId);
      expect(pendingPlanned.surveyVersion).toBe(plannedSurveyVersion);
      expect(pendingPlanned.surveyStatus).toBe('PLANNED');
      expect(pendingPlanned.surveyExecutionStatus).toBe('IN_PROGRESS');
      expect(pendingPlanned.scheduledStartAt).toBe(plannedAt);
      expect(pendingPlanned.activatedAt).toBeNull();

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${plannedAssignment.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const mineAccepted = await request(app.getHttpServer())
        .get('/v1/me/building-assignments')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const acceptedPlanned = mineAccepted.body.data.accepted.find(
        (item: any) => item.surveyId === plannedSurveyId,
      );
      expect(acceptedPlanned).toBeDefined();
      expect(acceptedPlanned.surveyStatus).toBe('PLANNED');
      expect(acceptedPlanned.surveyExecutionStatus).toBe('IN_PROGRESS');

      const acceptedActive = mineAccepted.body.data.accepted.find(
        (item: any) => item.building.id === active.buildingId,
      );
      expect(acceptedActive).toBeDefined();
      expect(acceptedActive.surveyId).toBe(activeSurvey.id);
      expect(acceptedActive.surveyVersion).toBe(activeSurvey.version);
      expect(acceptedActive.surveyStatus).toBe('ACTIVE');
      expect(acceptedActive.surveyExecutionStatus).toBe('IN_PROGRESS');
    });

    it('includes survey metadata in assignment history responses where survey context exists', async () => {
      const template = await seedCompletedSurveyTemplate('History Survey Context');
      const plannedAt = '2027-06-10T07:00:00.000Z';
      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${template.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nextScheduledAt: plannedAt })
        .expect(201);
      const plannedSurveyId = startRes.body.data.id as string;
      const plannedSurveyVersion = startRes.body.data.version as number;

      const assignRes = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: template.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurveyId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${assignRes.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      const history = await request(app.getHttpServer())
        .get('/v1/me/building-assignments/history')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      const eventWithSurvey = history.body.data.find(
        (event: any) =>
          event.surveyId === plannedSurveyId &&
          (event.type === 'ASSIGNED' || event.type === 'ACCEPTED'),
      );

      expect(eventWithSurvey).toBeDefined();
      expect(eventWithSurvey.surveyVersion).toBe(plannedSurveyVersion);
      expect(eventWithSurvey.surveyStatus).toBe('PLANNED');
      expect(eventWithSurvey.surveyExecutionStatus).toBe('IN_PROGRESS');
      expect(eventWithSurvey.scheduledStartAt).toBe(plannedAt);
    });

    it('sends survey-version-aware notification payloads for assignment invitation, activation, reopen, and completion', async () => {
      const template = await seedCompletedSurveyTemplate('Phase5 Notification Planned');
      const startRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${template.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nextScheduledAt: '2027-07-01T09:00:00.000Z' })
        .expect(201);
      const plannedSurveyId = startRes.body.data.id as string;
      const plannedSurveyVersion = startRes.body.data.version as number;

      const pendingAssignment = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: template.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurveyId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${pendingAssignment.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${template.buildingId}/surveys/${plannedSurveyId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const plannedDoor = await prisma.door.findFirstOrThrow({
        where: { floor: { surveyId: plannedSurveyId } },
        orderBy: { createdAt: 'asc' },
      });
      await prisma.door.update({
        where: { id: plannedDoor.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          submittedById: seeds.inspector.id,
        },
      });

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${template.buildingId}/surveys/${plannedSurveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${template.buildingId}/surveys/${plannedSurveyId}/reopen-fieldwork`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const completable = await setupCompletableActiveSurvey(
        'Phase5 Notification Completion',
      );
      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${completable.buildingId}/surveys/${completable.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);
      const confirmRes = await request(app.getHttpServer())
        .post(`/v1/buildings/${completable.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      const invitationCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'BUILDING_ASSIGNMENT_INVITED',
      );
      expect(invitationCall).toBeDefined();
      expect(invitationCall?.[0]).toContain(seeds.inspector.id);
      expect(invitationCall?.[1].data).toMatchObject({
        buildingId: template.buildingId,
        surveyId: plannedSurveyId,
        surveyVersion: String(plannedSurveyVersion),
        type: 'BUILDING_ASSIGNMENT_INVITED',
      });

      const activationCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'SURVEY_ACTIVATED',
      );
      expect(activationCall).toBeDefined();
      expect(activationCall?.[0]).toContain(seeds.inspector.id);
      expect(activationCall?.[1].data).toMatchObject({
        buildingId: template.buildingId,
        surveyId: plannedSurveyId,
        surveyVersion: String(plannedSurveyVersion),
        type: 'SURVEY_ACTIVATED',
      });

      const reopenCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'SURVEY_FIELDWORK_REOPENED',
      );
      expect(reopenCall).toBeDefined();
      expect(reopenCall?.[0]).toContain(seeds.inspector.id);
      expect(reopenCall?.[1].data).toMatchObject({
        buildingId: template.buildingId,
        surveyId: plannedSurveyId,
        surveyVersion: String(plannedSurveyVersion),
        type: 'SURVEY_FIELDWORK_REOPENED',
      });

      const completionCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'SURVEY_COMPLETED',
      );
      expect(completionCall).toBeDefined();
      expect(completionCall?.[0]).toContain(seeds.inspector.id);
      expect(completionCall?.[1].data).toMatchObject({
        buildingId: completable.buildingId,
        surveyId: completable.surveyId,
        surveyVersion: String(confirmRes.body.data.version),
        type: 'SURVEY_COMPLETED',
      });
    });
  });

  describe('Final blocker corrections', () => {
    it('closes legacy null-survey pending assignments at confirm-complete and prevents old acceptance in the next cycle', async () => {
      const staleInspector = await createInspector(
        'stale.assignment@test.com',
        'StalePass1234!',
      );
      const setup = await setupCompletableActiveSurvey(
        'Legacy Pending Closure Building',
      );

      const stalePending = await prisma.buildingAssignment.create({
        data: {
          orgId: seeds.org.id,
          buildingId: setup.buildingId,
          surveyId: null,
          inspectorId: staleInspector.id,
          assignedById: seeds.admin.id,
          status: 'PENDING',
          assignedAt: new Date(Date.now() - 60_000),
        },
      });

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/confirm-complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      const closedPending = await prisma.buildingAssignment.findUniqueOrThrow({
        where: { id: stalePending.id },
      });
      expect(closedPending.status).toBe('REMOVED');
      expect(closedPending.accessEndedAt).not.toBeNull();

      const closureEvent = await prisma.buildingAssignmentEvent.findFirst({
        where: {
          assignmentId: stalePending.id,
          type: 'ACCESS_REMOVED',
        },
      });
      expect(closureEvent).toBeTruthy();

      const startNext = await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const replacement = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: setup.buildingId,
          inspectorId: staleInspector.id,
          surveyId: startNext.body.data.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${stalePending.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'ACCEPTED' })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/v1/building-assignments/${replacement.body.data.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);
    });

    it('blocks stale legacy assignment acceptance while allowing rejection cleanup', async () => {
      const staleInspector = await createInspector(
        'stale.acceptance@test.com',
        'StaleAccept1234!',
      );
      const setup = await createAcceptedBuilding('Stale Acceptance Guard Building');
      const activeSurvey = await bootstrapActiveSurvey(setup.buildingId);

      const stalePending = await prisma.buildingAssignment.create({
        data: {
          orgId: seeds.org.id,
          buildingId: setup.buildingId,
          surveyId: null,
          inspectorId: staleInspector.id,
          assignedById: seeds.admin.id,
          status: 'PENDING',
          assignedAt: new Date(activeSurvey.startedAt.getTime() - 60_000),
        },
      });

      const staleAccept = await request(app.getHttpServer())
        .post(`/v1/building-assignments/${stalePending.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'ACCEPTED' })
        .expect(400);

      expect(JSON.stringify(staleAccept.body)).toContain('stale or expired');

      const rejected = await request(app.getHttpServer())
        .post(`/v1/building-assignments/${stalePending.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'REJECTED' })
        .expect(201);

      expect(rejected.body.data.status).toBe('REJECTED');
    });

    it('enforces conflict scoping between legacy and survey-linked assignment creation', async () => {
      const otherInspector = await createInspector(
        'conflict.scope@test.com',
        'Conflict1234!',
      );

      const scopedA = await seedCompletedSurveyTemplate('Conflict Scope A');
      const startA = await request(app.getHttpServer())
        .post(`/v1/buildings/${scopedA.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);
      const plannedSurveyA = startA.body.data.id as string;

      await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: scopedA.buildingId,
          inspectorId: seeds.inspector.id,
          surveyId: plannedSurveyA,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: scopedA.buildingId,
          inspectorId: otherInspector.id,
        })
        .expect(400);

      const scopedB = await seedCompletedSurveyTemplate('Conflict Scope B');
      const startB = await request(app.getHttpServer())
        .post(`/v1/buildings/${scopedB.buildingId}/surveys/start-next`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);
      const plannedSurveyB = startB.body.data.id as string;

      await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: scopedB.buildingId,
          inspectorId: seeds.inspector.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: scopedB.buildingId,
          inspectorId: otherInspector.id,
          surveyId: plannedSurveyB,
        })
        .expect(400);
    });

    it('sends building and door certificate notifications to assignment recipients, not legacy inspection recipients', async () => {
      const setup = await setupCompletableActiveSurvey(
        'Certificate Recipient Scope Building',
      );
      const legacyInspector = await createInspector(
        'legacy.recipient@test.com',
        'LegacyRecipient1234!',
      );

      const legacyInspection = await prisma.inspection.create({
        data: {
          orgId: seeds.org.id,
          type: 'BUILDING',
          status: 'ACTIVE',
          buildingId: setup.buildingId,
          createdById: seeds.admin.id,
        },
      });

      await prisma.inspectionAssignment.create({
        data: {
          inspectionId: legacyInspection.id,
          inspectorId: legacyInspector.id,
          status: 'ACCEPTED',
        },
      });

      notifyUsersSpy.mockClear();

      await request(app.getHttpServer())
        .post(`/v1/doors/${setup.doorId}/certificate/register`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          certId: 'door-cert-recipients',
          objectPath: `orgs/${seeds.org.id}/doors/${setup.doorId}/recipients-cert.pdf`,
        })
        .expect(201);

      const doorCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'DOOR_CERTIFIED',
      );
      expect(doorCall).toBeDefined();
      expect(doorCall?.[0]).toContain(seeds.inspector.id);
      expect(doorCall?.[0]).not.toContain(legacyInspector.id);

      await request(app.getHttpServer())
        .post(
          `/v1/buildings/${setup.buildingId}/surveys/${setup.surveyId}/complete-fieldwork`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/buildings/${setup.buildingId}/certificate/register`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          certId: 'building-cert-recipients',
          objectPath: `orgs/${seeds.org.id}/buildings/${setup.buildingId}/recipients-cert.pdf`,
        })
        .expect(201);

      const buildingCall = notifyUsersSpy.mock.calls.find(
        ([, message]) => message.data?.type === 'BUILDING_CERTIFIED',
      );
      expect(buildingCall).toBeDefined();
      expect(buildingCall?.[0]).toContain(seeds.inspector.id);
      expect(buildingCall?.[0]).not.toContain(legacyInspector.id);
    });

    it('blocks legacy pending acceptance when there is survey history but no active survey, while allowing reject cleanup', async () => {
      const staleInspector = await createInspector(
        'no-active-history@test.com',
        'NoActiveHistory1234!',
      );
      const seeded = await seedCompletedSurveyTemplate(
        'No Active But Survey History',
      );

      const pending = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: seeded.buildingId,
          inspectorId: staleInspector.id,
        })
        .expect(201);

      const staleAccept = await request(app.getHttpServer())
        .post(`/v1/building-assignments/${pending.body.data.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'ACCEPTED' })
        .expect(400);

      expect(JSON.stringify(staleAccept.body)).toContain('stale or expired');

      const rejected = await request(app.getHttpServer())
        .post(`/v1/building-assignments/${pending.body.data.id}/respond`)
        .set('Authorization', `Bearer ${staleInspector.token}`)
        .send({ status: 'REJECTED' })
        .expect(201);

      expect(rejected.body.data.status).toBe('REJECTED');
    });

    it('allows legacy pending acceptance for first-cycle bootstrap when building has no survey history', async () => {
      const buildingRes = await request(app.getHttpServer())
        .post('/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bootstrap Legacy Acceptance Building' })
        .expect(201);
      const buildingId = buildingRes.body.data.id as string;

      const surveyHistoryCount = await prisma.survey.count({
        where: { buildingId },
      });
      expect(surveyHistoryCount).toBe(0);

      const pending = await request(app.getHttpServer())
        .post('/v1/building-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId,
          inspectorId: seeds.inspector.id,
        })
        .expect(201);

      const accepted = await request(app.getHttpServer())
        .post(`/v1/building-assignments/${pending.body.data.id}/respond`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ status: 'ACCEPTED' })
        .expect(201);

      expect(accepted.body.data.status).toBe('ACCEPTED');
    });
  });
});
