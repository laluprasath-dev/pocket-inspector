import assert from 'node:assert/strict';

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

type AssignmentResponse = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REMOVED' | 'REASSIGNED';
  building: {
    id: string;
    name: string;
  };
};

const baseUrl = (process.env['FLOW_BASE_URL'] ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
);
const adminEmail = process.env['FLOW_ADMIN_EMAIL'] ?? '';
const adminPassword = process.env['FLOW_ADMIN_PASSWORD'] ?? '';
const newInspectorEmail =
  process.env['FLOW_NEW_INSPECTOR_EMAIL'] ??
  `flow-inspector+${Date.now()}@example.com`;
const newInspectorPassword =
  process.env['FLOW_NEW_INSPECTOR_PASSWORD'] ?? 'Inspector1234!';

function step(title: string) {
  console.log(`\n[flow] ${title}`);
}

function requiredEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.token
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
    },
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

async function main() {
  requiredEnv('FLOW_ADMIN_EMAIL', adminEmail);
  requiredEnv('FLOW_ADMIN_PASSWORD', adminPassword);

  step('0. bootstrap admin session and create a fresh inspector');
  const bootstrapAdmin = await login(
    adminEmail,
    adminPassword,
    'admin-bootstrap-device',
  );

  const createdInspector = await api<UserResponse>('POST', '/v1/users', {
    token: bootstrapAdmin.accessToken,
    body: {
      email: newInspectorEmail,
      password: newInspectorPassword,
      role: 'INSPECTOR',
      firstName: 'Flow',
      lastName: 'Inspector',
    },
    expectedStatus: 201,
  });

  console.log(
    `created inspector: ${createdInspector.id} ${createdInspector.email}`,
  );

  step('1. login admin and inspector in parallel');
  const [adminSession, inspectorSession] = await Promise.all([
    login(adminEmail, adminPassword, 'admin-web-device'),
    login(newInspectorEmail, newInspectorPassword, 'inspector-mobile-device'),
  ]);

  const [adminMe, inspectorMe] = await Promise.all([
    api<UserResponse>('GET', '/v1/auth/me', {
      token: adminSession.accessToken,
      expectedStatus: 200,
    }),
    api<UserResponse>('GET', '/v1/auth/me', {
      token: inspectorSession.accessToken,
      expectedStatus: 200,
    }),
  ]);

  assert.equal(adminMe.role, 'ADMIN');
  assert.equal(inspectorMe.role, 'INSPECTOR');
  assert.equal(inspectorMe.id, createdInspector.id);

  step('2. admin creates site and building');
  const site = await api<{ id: string }>('POST', '/v1/sites', {
    token: adminSession.accessToken,
    body: { name: `Flow Site ${Date.now()}` },
    expectedStatus: 201,
  });

  const building = await api<{ id: string }>('POST', '/v1/buildings', {
    token: adminSession.accessToken,
    body: {
      name: `Flow Building ${Date.now()}`,
      siteId: site.id,
    },
    expectedStatus: 201,
  });

  step('3. admin assigns building to inspector');
  const assignment = await api<AssignmentResponse>(
    'POST',
    '/v1/building-assignments',
    {
      token: adminSession.accessToken,
      body: {
        buildingId: building.id,
        inspectorId: createdInspector.id,
        adminNote: 'Flow-script assignment',
      },
      expectedStatus: 201,
    },
  );

  assert.equal(assignment.status, 'PENDING');

  step('4. inspector checks pending assignments');
  const pendingAssignments = await api<{
    pending: AssignmentResponse[];
    accepted: AssignmentResponse[];
  }>('GET', '/v1/me/building-assignments', {
    token: inspectorSession.accessToken,
    expectedStatus: 200,
  });

  assert.ok(
    pendingAssignments.pending.some((item) => item.id === assignment.id),
    'expected assignment in pending bucket',
  );

  step('5. inspector accepts invitation');
  await api<AssignmentResponse>(
    'POST',
    `/v1/building-assignments/${assignment.id}/respond`,
    {
      token: inspectorSession.accessToken,
      body: {
        status: 'ACCEPTED',
        inspectorNote: 'Accepted in flow script',
      },
      expectedStatus: 201,
    },
  );

  step('6. verify inspector list/detail endpoints after acceptance');
  const [acceptedAssignments, inspectorBuildings, inspectorSites] =
    await Promise.all([
      api<{
        pending: AssignmentResponse[];
        accepted: AssignmentResponse[];
      }>('GET', '/v1/me/building-assignments', {
        token: inspectorSession.accessToken,
        expectedStatus: 200,
      }),
      api<Array<{ id: string }>>('GET', '/v1/buildings', {
        token: inspectorSession.accessToken,
        expectedStatus: 200,
      }),
      api<Array<{ id: string }>>('GET', '/v1/sites', {
        token: inspectorSession.accessToken,
        expectedStatus: 200,
      }),
    ]);

  assert.ok(
    acceptedAssignments.accepted.some((item) => item.id === assignment.id),
    'expected assignment in accepted bucket',
  );
  assert.ok(
    inspectorBuildings.some((item) => item.id === building.id),
    'expected building in inspector list',
  );
  assert.ok(
    inspectorSites.some((item) => item.id === site.id),
    'expected site in inspector list',
  );

  await api('GET', `/v1/buildings/${building.id}`, {
    token: inspectorSession.accessToken,
    expectedStatus: 200,
  });

  step('7. verify history endpoints');
  const [adminHistory, inspectorHistory] = await Promise.all([
    api<any[]>('GET', `/v1/building-assignments/history?buildingId=${building.id}`, {
      token: adminSession.accessToken,
      expectedStatus: 200,
    }),
    api<any[]>('GET', '/v1/me/building-assignments/history', {
      token: inspectorSession.accessToken,
      expectedStatus: 200,
    }),
  ]);

  assert.ok(adminHistory.length >= 2, 'expected assigned + accepted events');
  assert.ok(inspectorHistory.length >= 1, 'expected inspector history rows');

  step('8. verify inspector workflow access by creating a floor');
  const floor = await api<{ id: string }>('POST', '/v1/floors', {
    token: inspectorSession.accessToken,
    body: {
      buildingId: building.id,
      label: 'Ground',
      notes: 'Created by flow script after acceptance',
    },
    expectedStatus: 201,
  });

  await api('GET', `/v1/buildings/${building.id}/floors`, {
    token: inspectorSession.accessToken,
    expectedStatus: 200,
  });

  console.log('\n[summary]');
  console.log(`baseUrl:    ${baseUrl}`);
  console.log(`admin:      ${adminMe.email} (${adminMe.id})`);
  console.log(`inspector:  ${inspectorMe.email} (${inspectorMe.id})`);
  console.log(`siteId:     ${site.id}`);
  console.log(`buildingId: ${building.id}`);
  console.log(`assignment: ${assignment.id}`);
  console.log(`floorId:    ${floor.id}`);
  console.log('\nflow test completed successfully');
}

void main().catch((error: unknown) => {
  console.error('\nflow test failed');
  console.error(error);
  process.exitCode = 1;
});
