import 'dotenv/config';
import assert from 'node:assert/strict';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9sAAAAASUVORK5CYII=',
  'base64',
);

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n' +
    '4 0 obj<</Length 44>>stream\n' +
    'BT /F1 12 Tf 72 120 Td (Pocket Inspector Test) Tj ET\n' +
    'endstream\n' +
    'endobj\n' +
    'trailer<</Root 1 0 R>>\n' +
    '%%EOF\n',
  'utf8',
);

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

type ApiError = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
};

type UserResponse = {
  id: string;
  email: string;
  role: 'ADMIN' | 'INSPECTOR';
};

type SiteResponse = { id: string; name: string };

type BuildingResponse = { id: string; name: string };

type AssignmentResponse = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REMOVED' | 'REASSIGNED';
  surveyId?: string | null;
  surveyVersion?: number | null;
  building: {
    id: string;
    name: string;
  };
};

type AssignmentBuckets = {
  pending: AssignmentResponse[];
  acceptedActive: AssignmentResponse[];
  acceptedPlanned: AssignmentResponse[];
  accepted: AssignmentResponse[];
};

type SurveySummary = {
  id: string;
  version: number;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  executionStatus?: 'IN_PROGRESS' | 'INSPECTOR_COMPLETED';
  buildingCertificatePresent?: boolean;
};

type FloorResponse = { id: string; label?: string | null };

type DoorResponse = {
  id: string;
  code: string;
  status: 'DRAFT' | 'SUBMITTED' | 'CERTIFIED';
  imageCount?: number;
  certificatePresent?: boolean;
};

type SignedUploadResponse = {
  signedUrl: string;
  objectPath: string;
  imageId?: string;
  certId?: string;
  role?: string;
};

type CompletedSurveyListItem = {
  surveyId: string;
};

const baseUrl = (process.env['FLOW_BASE_URL'] ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
);
const adminEmail = process.env['FLOW_ADMIN_EMAIL'] ?? '';
const adminPassword = process.env['FLOW_ADMIN_PASSWORD'] ?? '';
const flowAllowDataMutation = process.env['FLOW_ALLOW_DATA_MUTATION'] === 'true';
const flowAllowRemote = process.env['FLOW_ALLOW_REMOTE'] === 'true';
const runLabel = process.env['FLOW_RUN_LABEL'] ?? String(Date.now());
const inspectorPassword =
  process.env['FLOW_INSPECTOR_PASSWORD'] ?? 'Password1234!';
const nextSurveyDays = Number.parseInt(
  process.env['FLOW_NEXT_SURVEY_DAYS'] ?? '30',
  10,
);

function step(title: string) {
  console.log(`\n[versioning-flow] ${title}`);
}

function requiredEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function assertSafeTarget() {
  if (!flowAllowDataMutation) {
    throw new Error(
      'Refusing to mutate data. Set FLOW_ALLOW_DATA_MUTATION=true to run this script.',
    );
  }

  const url = new URL(baseUrl);
  const isLocalHost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '0.0.0.0';

  if (!isLocalHost && !flowAllowRemote) {
    throw new Error(
      `Refusing to run against remote API ${baseUrl}. Set FLOW_ALLOW_REMOTE=true if you intend to mutate non-local data.`,
    );
  }
}

async function api<T>(
  method: string,
  path: string,
  options?: {
    token?: string;
    body?: unknown;
    expectedStatus?: number;
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const expectedStatus = options?.expectedStatus ?? 200;
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as ApiEnvelope<T> | ApiError) : null;

  if (response.status !== expectedStatus) {
    const pretty = parsed ? JSON.stringify(parsed, null, 2) : '<empty body>';
    throw new Error(
      `${method} ${path} expected ${expectedStatus}, got ${response.status}\n${pretty}`,
    );
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (parsed as ApiEnvelope<T>).data;
}

async function uploadBinary(
  signedUrl: string,
  contentType: string,
  payload: Buffer,
) {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: payload as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Signed upload failed with ${response.status}: ${text.slice(0, 500)}`,
    );
  }
}

async function login(
  email: string,
  password: string,
  deviceId: string,
): Promise<LoginResponse> {
  return api<LoginResponse>('POST', '/v1/auth/login', {
    body: {
      email,
      password,
      deviceId,
      deviceName: deviceId,
      deviceType: 'web',
    },
    expectedStatus: 200,
  });
}

async function createInspector(
  adminToken: string,
  email: string,
  firstName: string,
): Promise<UserResponse> {
  return api<UserResponse>('POST', '/v1/users', {
    token: adminToken,
    body: {
      email,
      password: inspectorPassword,
      role: 'INSPECTOR',
      firstName,
      lastName: 'Flow',
    },
    expectedStatus: 201,
  });
}

async function requestAndRegisterDoorImage(
  inspectorToken: string,
  doorId: string,
) {
  const request = await api<SignedUploadResponse>(
    'POST',
    `/v1/doors/${doorId}/images/signed-upload`,
    {
      token: inspectorToken,
      body: {
        role: 'FRONT_FACE',
        contentType: 'image/png',
      },
      expectedStatus: 200,
    },
  );

  assert.ok(request.imageId, 'signed-upload did not return imageId');
  assert.ok(request.role, 'signed-upload did not return role');

  await uploadBinary(request.signedUrl, 'image/png', PNG_BYTES);

  return api<{ id: string }>('POST', `/v1/doors/${doorId}/images/register`, {
    token: inspectorToken,
    body: {
      imageId: request.imageId,
      objectPath: request.objectPath,
      role: request.role,
    },
    expectedStatus: 201,
  });
}

async function requestAndRegisterDoorCertificate(
  adminToken: string,
  doorId: string,
) {
  const request = await api<SignedUploadResponse>(
    'POST',
    `/v1/doors/${doorId}/certificate/signed-upload`,
    {
      token: adminToken,
      expectedStatus: 200,
    },
  );

  assert.ok(request.certId, 'door cert signed-upload did not return certId');
  await uploadBinary(request.signedUrl, 'application/pdf', PDF_BYTES);

  return api<{ id: string }>(
    'POST',
    `/v1/doors/${doorId}/certificate/register`,
    {
      token: adminToken,
      body: {
        certId: request.certId,
        objectPath: request.objectPath,
      },
      expectedStatus: 201,
    },
  );
}

async function requestAndRegisterBuildingCertificate(
  adminToken: string,
  buildingId: string,
) {
  const request = await api<SignedUploadResponse>(
    'POST',
    `/v1/buildings/${buildingId}/certificate/signed-upload`,
    {
      token: adminToken,
      expectedStatus: 200,
    },
  );

  assert.ok(
    request.certId,
    'building cert signed-upload did not return certId',
  );
  await uploadBinary(request.signedUrl, 'application/pdf', PDF_BYTES);

  return api<{ id: string }>(
    'POST',
    `/v1/buildings/${buildingId}/certificate/register`,
    {
      token: adminToken,
      body: {
        certId: request.certId,
        objectPath: request.objectPath,
      },
      expectedStatus: 201,
    },
  );
}

async function main() {
  requiredEnv('FLOW_ADMIN_EMAIL', adminEmail);
  requiredEnv('FLOW_ADMIN_PASSWORD', adminPassword);
  assertSafeTarget();

  const inspector1Email = `flow-v1-${runLabel}@example.com`;
  const inspector2Email = `flow-v2-${runLabel}@example.com`;

  step('0. bootstrap admin and create fresh inspectors');
  const adminBootstrap = await login(
    adminEmail,
    adminPassword,
    `admin-bootstrap-${runLabel}`,
  );

  const [inspector1, inspector2] = await Promise.all([
    createInspector(adminBootstrap.accessToken, inspector1Email, 'FlowV1'),
    createInspector(adminBootstrap.accessToken, inspector2Email, 'FlowV2'),
  ]);

  step('1. login admin and both inspectors');
  const [adminSession, inspector1Session, inspector2Session] = await Promise.all([
    login(adminEmail, adminPassword, `admin-session-${runLabel}`),
    login(inspector1Email, inspectorPassword, `inspector1-session-${runLabel}`),
    login(inspector2Email, inspectorPassword, `inspector2-session-${runLabel}`),
  ]);

  step('2. create fresh site and building');
  const site = await api<SiteResponse>('POST', '/v1/sites', {
    token: adminSession.accessToken,
    body: { name: `Flow Versioning Site ${runLabel}` },
    expectedStatus: 201,
  });

  const building = await api<BuildingResponse>('POST', '/v1/buildings', {
    token: adminSession.accessToken,
    body: {
      name: `Flow Versioning Building ${runLabel}`,
      siteId: site.id,
    },
    expectedStatus: 201,
  });

  step('3. assign v1 photographer and accept');
  const assignmentV1 = await api<AssignmentResponse>(
    'POST',
    '/v1/building-assignments',
    {
      token: adminSession.accessToken,
      body: {
        buildingId: building.id,
        inspectorId: inspector1.id,
        adminNote: 'Versioning flow v1 assignment',
      },
      expectedStatus: 201,
    },
  );

  const inspector1Pending = await api<{
    pending: AssignmentResponse[];
    accepted: AssignmentResponse[];
  }>('GET', '/v1/me/building-assignments', {
    token: inspector1Session.accessToken,
    expectedStatus: 200,
  });
  assert.ok(
    inspector1Pending.pending.some((item) => item.id === assignmentV1.id),
    'v1 assignment not found in pending bucket',
  );

  await api<AssignmentResponse>(
    'POST',
    `/v1/building-assignments/${assignmentV1.id}/respond`,
    {
      token: inspector1Session.accessToken,
      body: {
        status: 'ACCEPTED',
        inspectorNote: 'Accepting v1 assignment',
      },
      expectedStatus: 201,
    },
  );

  step('4. create v1 floor and doors');
  const floorV1 = await api<FloorResponse>('POST', '/v1/floors', {
    token: inspector1Session.accessToken,
    body: {
      buildingId: building.id,
      label: 'Ground',
      notes: 'Versioning flow v1 floor',
    },
    expectedStatus: 201,
  });

  const [doorV1A, doorV1B] = await Promise.all([
    api<DoorResponse>('POST', '/v1/doors', {
      token: inspector1Session.accessToken,
      body: {
        floorId: floorV1.id,
        code: 'D1',
        locationNotes: 'Left side',
      },
      expectedStatus: 201,
    }),
    api<DoorResponse>('POST', '/v1/doors', {
      token: inspector1Session.accessToken,
      body: {
        floorId: floorV1.id,
        code: 'D2',
        locationNotes: 'Right side',
      },
      expectedStatus: 201,
    }),
  ]);

  const surveyV1 = await api<SurveySummary | null>(
    'GET',
    `/v1/buildings/${building.id}/surveys/current`,
    {
      token: adminSession.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(surveyV1, 'current v1 survey should exist after first floor create');
  assert.equal(surveyV1.version, 1);
  assert.equal(surveyV1.status, 'ACTIVE');

  step('5. upload v1 door images');
  await Promise.all([
    requestAndRegisterDoorImage(inspector1Session.accessToken, doorV1A.id),
    requestAndRegisterDoorImage(inspector1Session.accessToken, doorV1B.id),
  ]);

  const [doorV1AImages, doorV1BImages] = await Promise.all([
    api<Array<{ id: string }>>('GET', `/v1/doors/${doorV1A.id}/images`, {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    }),
    api<Array<{ id: string }>>('GET', `/v1/doors/${doorV1B.id}/images`, {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    }),
  ]);
  assert.equal(doorV1AImages.length, 1);
  assert.equal(doorV1BImages.length, 1);

  step('6. submit v1 doors using single and bulk endpoints');
  await api('POST', `/v1/doors/${doorV1A.id}/submit`, {
    token: inspector1Session.accessToken,
    expectedStatus: 200,
  });

  const v1ReadinessBeforeBulk = await api<{
    summary: { submittedDoors: number };
  }>(
    'GET',
    `/v1/buildings/${building.id}/surveys/${surveyV1.id}/fieldwork-readiness`,
    {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.equal(v1ReadinessBeforeBulk.summary.submittedDoors, 1);

  const v1BulkSubmit = await api<{
    summary: { submittedDoors: number };
    submittedDoors: Array<{ id: string }>;
  }>(
    'POST',
    `/v1/buildings/${building.id}/surveys/${surveyV1.id}/submit-doors`,
    {
      token: inspector1Session.accessToken,
      body: { doorIds: [doorV1B.id] },
      expectedStatus: 200,
    },
  );
  assert.equal(v1BulkSubmit.summary.submittedDoors, 1);
  assert.equal(v1BulkSubmit.submittedDoors[0]?.id, doorV1B.id);

  step('7. complete v1 fieldwork');
  const v1Completed = await api<SurveySummary>(
    'POST',
    `/v1/buildings/${building.id}/surveys/${surveyV1.id}/complete-fieldwork`,
    {
      token: inspector1Session.accessToken,
      body: {},
      expectedStatus: 200,
    },
  );
  assert.equal(v1Completed.executionStatus, 'INSPECTOR_COMPLETED');

  step('8. upload v1 door and building certificates');
  await Promise.all([
    requestAndRegisterDoorCertificate(adminSession.accessToken, doorV1A.id),
    requestAndRegisterDoorCertificate(adminSession.accessToken, doorV1B.id),
  ]);
  await requestAndRegisterBuildingCertificate(
    adminSession.accessToken,
    building.id,
  );

  step('9. confirm v1 and schedule planned v2');
  const nextSurveyAt = new Date(Date.now() + nextSurveyDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  const confirmV1 = await api<{
    status: 'COMPLETED';
    plannedNextSurvey: SurveySummary | null;
  }>('POST', `/v1/buildings/${building.id}/surveys/confirm-complete`, {
    token: adminSession.accessToken,
    body: {
      nextScheduledAt: nextSurveyAt,
      nextScheduledNote: 'Automated versioning test',
      nextAssignedInspectorId: inspector2.id,
    },
    expectedStatus: 200,
  });
  assert.equal(confirmV1.status, 'COMPLETED');
  assert.ok(confirmV1.plannedNextSurvey, 'planned v2 survey missing');
  assert.equal(confirmV1.plannedNextSurvey?.status, 'PLANNED');
  assert.equal(confirmV1.plannedNextSurvey?.version, 2);
  const surveyV2 = confirmV1.plannedNextSurvey as SurveySummary;

  step('10. verify v1 completed-history endpoints');
  const inspector1Completed = await api<CompletedSurveyListItem[]>(
    'GET',
    '/v1/me/building-assignments/completed-surveys',
    {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(
    inspector1Completed.some((item) => item.surveyId === surveyV1.id),
    'v1 survey missing from inspector1 completed list',
  );

  const inspector1Detail = await api<{ id: string }>(
    'GET',
    `/v1/me/building-assignments/completed-surveys/${surveyV1.id}`,
    {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.equal(inspector1Detail.id, surveyV1.id);

  await Promise.all([
    api('GET', `/v1/me/building-assignments/completed-surveys/${surveyV1.id}/building-certificate`, {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    }),
    api('GET', `/v1/me/building-assignments/completed-surveys/${surveyV1.id}/doors/${doorV1A.id}/images`, {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    }),
    api('GET', `/v1/me/building-assignments/completed-surveys/${surveyV1.id}/doors/${doorV1A.id}/certificate`, {
      token: inspector1Session.accessToken,
      expectedStatus: 200,
    }),
  ]);

  step('11. assign v2 photographer to planned survey and accept');
  const assignmentV2 = await api<AssignmentResponse>(
    'POST',
    '/v1/building-assignments',
    {
      token: adminSession.accessToken,
      body: {
        buildingId: building.id,
        surveyId: surveyV2.id,
        inspectorId: inspector2.id,
        adminNote: 'Versioning flow v2 assignment',
      },
      expectedStatus: 201,
    },
  );
  assert.equal(assignmentV2.status, 'PENDING');

  const inspector2Pending = await api<AssignmentBuckets>(
    'GET',
    '/v1/me/building-assignments',
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  const pendingV2 = inspector2Pending.pending.find(
    (item) => item.id === assignmentV2.id,
  );
  assert.ok(pendingV2, 'v2 assignment missing from pending bucket');
  assert.equal(pendingV2?.surveyId, surveyV2.id);

  await api(
    'POST',
    `/v1/building-assignments/${assignmentV2.id}/respond`,
    {
      token: inspector2Session.accessToken,
      body: {
        status: 'ACCEPTED',
        inspectorNote: 'Accepting v2 assignment',
      },
      expectedStatus: 201,
    },
  );

  step('12. verify v2 auto-activated and cloned clean structure');

  const currentV2 = await api<SurveySummary | null>(
    'GET',
    `/v1/buildings/${building.id}/surveys/current`,
    {
      token: adminSession.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(currentV2, 'current v2 survey should exist immediately after acceptance');
  assert.equal(currentV2.id, surveyV2.id);
  assert.equal(currentV2.status, 'ACTIVE');

  const buildingAfterAccept = await api<{
    currentSurveyId: string | null;
    currentSurveyVersion: number | null;
    activeSurvey: SurveySummary | null;
    plannedSurvey: SurveySummary | null;
    nextSurveyFlowState: 'NONE' | 'PLANNED_UNASSIGNED' | 'PLANNED_PENDING_ACCEPTANCE' | 'ACTIVE';
  }>('GET', `/v1/buildings/${building.id}`, {
    token: adminSession.accessToken,
    expectedStatus: 200,
  });
  assert.equal(buildingAfterAccept.currentSurveyId, surveyV2.id);
  assert.equal(buildingAfterAccept.currentSurveyVersion, 2);
  assert.equal(buildingAfterAccept.activeSurvey?.id, surveyV2.id);
  assert.equal(buildingAfterAccept.plannedSurvey, null);
  assert.equal(buildingAfterAccept.nextSurveyFlowState, 'ACTIVE');

  const surveyV2Detail = await api<{
    id: string;
    version: number;
    buildingCertificatePresent: boolean;
    floors: Array<{
      id: string;
      doors: Array<DoorResponse>;
    }>;
  }>('GET', `/v1/buildings/${building.id}/surveys/${surveyV2.id}`, {
    token: adminSession.accessToken,
    expectedStatus: 200,
  });
  assert.equal(surveyV2Detail.version, 2);
  assert.equal(surveyV2Detail.buildingCertificatePresent, false);
  assert.equal(surveyV2Detail.floors.length, 1);
  const v2Doors = surveyV2Detail.floors.flatMap((floor) => floor.doors);
  assert.equal(v2Doors.length, 2);
  assert.ok(v2Doors.every((door) => door.status === 'DRAFT'));
  assert.ok(v2Doors.every((door) => door.imageCount === 0));
  assert.ok(v2Doors.every((door) => door.certificatePresent === false));

  step('13. verify v2 photographer access and upload fresh v2 images');
  const inspector2Accepted = await api<AssignmentBuckets>(
    'GET',
    '/v1/me/building-assignments',
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(
    inspector2Accepted.acceptedActive.some((item) => item.id === assignmentV2.id),
    'v2 assignment missing from acceptedActive bucket',
  );
  assert.ok(
    !inspector2Accepted.acceptedPlanned.some((item) => item.id === assignmentV2.id),
    'v2 assignment should not remain in acceptedPlanned after acceptance auto-activates the survey',
  );

  const activeFloorsV2 = await api<FloorResponse[]>(
    'GET',
    `/v1/buildings/${building.id}/floors`,
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.equal(activeFloorsV2.length, 1);

  const activeDoorsV2 = await api<DoorResponse[]>(
    'GET',
    `/v1/floors/${activeFloorsV2[0]?.id}/doors`,
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.equal(activeDoorsV2.length, 2);

  await Promise.all(
    activeDoorsV2.map((door) =>
      requestAndRegisterDoorImage(inspector2Session.accessToken, door.id),
    ),
  );

  const readinessV2 = await api<{
    summary: { draftDoorsReadyToSubmit: number };
  }>(
    'GET',
    `/v1/buildings/${building.id}/surveys/${surveyV2.id}/fieldwork-readiness`,
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.equal(readinessV2.summary.draftDoorsReadyToSubmit, 2);

  step('14. complete v2 using autoSubmitValidDoors');
  const completeV2 = await api<SurveySummary>(
    'POST',
    `/v1/buildings/${building.id}/surveys/${surveyV2.id}/complete-fieldwork`,
    {
      token: inspector2Session.accessToken,
      body: { autoSubmitValidDoors: true },
      expectedStatus: 200,
    },
  );
  assert.equal(completeV2.executionStatus, 'INSPECTOR_COMPLETED');

  step('15. upload v2 certificates and confirm complete');
  const refreshedV2Detail = await api<{
    floors: Array<{ doors: Array<DoorResponse> }>;
  }>('GET', `/v1/buildings/${building.id}/surveys/${surveyV2.id}`, {
    token: adminSession.accessToken,
    expectedStatus: 200,
  });
  const refreshedV2DoorIds = refreshedV2Detail.floors.flatMap((floor) =>
    floor.doors.map((door) => door.id),
  );

  await Promise.all(
    refreshedV2DoorIds.map((doorId) =>
      requestAndRegisterDoorCertificate(adminSession.accessToken, doorId),
    ),
  );
  await requestAndRegisterBuildingCertificate(
    adminSession.accessToken,
    building.id,
  );

  const confirmV2 = await api<SurveySummary>(
    'POST',
    `/v1/buildings/${building.id}/surveys/confirm-complete`,
    {
      token: adminSession.accessToken,
      body: {},
      expectedStatus: 200,
    },
  );
  assert.equal(confirmV2.status, 'COMPLETED');

  step('16. verify v2 completed history and no remaining active work');
  const inspector2Completed = await api<CompletedSurveyListItem[]>(
    'GET',
    '/v1/me/building-assignments/completed-surveys',
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(
    inspector2Completed.some((item) => item.surveyId === surveyV2.id),
    'v2 survey missing from inspector2 completed list',
  );

  const inspector2ActiveAfter = await api<AssignmentBuckets>(
    'GET',
    '/v1/me/building-assignments',
    {
      token: inspector2Session.accessToken,
      expectedStatus: 200,
    },
  );
  assert.ok(
    ![
      ...inspector2ActiveAfter.pending,
      ...inspector2ActiveAfter.acceptedActive,
      ...inspector2ActiveAfter.acceptedPlanned,
    ].some((item) => item.building.id === building.id),
    'test building should not remain in active assignment buckets after v2 completion',
  );

  console.log('\n[summary]');
  console.log(`baseUrl:          ${baseUrl}`);
  console.log(`siteId:           ${site.id}`);
  console.log(`buildingId:       ${building.id}`);
  console.log(`inspectorV1Email: ${inspector1.email}`);
  console.log(`inspectorV2Email: ${inspector2.email}`);
  console.log(`surveyV1Id:       ${surveyV1.id}`);
  console.log(`surveyV2Id:       ${surveyV2.id}`);
  console.log(`assignmentV1Id:   ${assignmentV1.id}`);
  console.log(`assignmentV2Id:   ${assignmentV2.id}`);
  console.log('\nFull v1 -> v2 versioning flow completed successfully');
}

void main().catch((error: unknown) => {
  console.error('\nVersioning flow test failed');
  console.error(error);
  process.exitCode = 1;
});
