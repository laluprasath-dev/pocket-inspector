/**
 * End-to-end image upload test script.
 *
 * Flow for each image in testDoors/:
 *   1. Login → get accessToken
 *   2. POST /v1/doors/:id/images/signed-upload  → get { signedUrl, objectPath, imageId }
 *   3. PUT <signedUrl> with image binary          → GCS upload
 *   4. POST /v1/doors/:id/images/register        → save record in DB
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/test-image-upload.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.TEST_PASSWORD ?? 'Admin1234!';

const IMAGES_DIR = path.join(__dirname, '..', 'testDoors');

const ROLE_MAP: Record<string, string> = {
  'download.jpeg': 'FRONT_FACE',
  'download (1).jpeg': 'REAR_FACE',
  'istockphoto-858326176-612x612.jpg': 'FRAME_GAP',
};

const LABEL_MAP: Record<string, string> = {
  'download.jpeg': 'Front face of door',
  'download (1).jpeg': 'Rear face of door',
  'istockphoto-858326176-612x612.jpg': 'Frame gap measurement',
};

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL']!,
});
const prisma = new PrismaClient({ adapter });

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`\n${msg}`);
}

function ok(msg: string) {
  console.log(`  ✅  ${msg}`);
}

function fail(msg: string) {
  console.error(`  ❌  ${msg}`);
}

async function apiPost(path: string, body: object, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    message?: string;
  };
  return { status: res.status, json };
}

async function putBinary(
  signedUrl: string,
  filePath: string,
  contentType: string,
) {
  const buffer = fs.readFileSync(filePath);
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  });
  return res.status;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pocket Inspector — Image Upload Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── Step 0: Find a door to upload images to ───────────────────────────
  log('Step 0 — Finding most recent door in the database...');
  const door = await prisma.door.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      floor: {
        include: { building: { select: { name: true, orgId: true } } },
      },
    },
  });

  if (!door) {
    fail('No door found in the database. Create a door first via the API.');
    process.exit(1);
  }

  ok(`Found door: "${door.code}" (id: ${door.id})`);
  ok(`Building: ${door.floor.building.name} | Floor: ${door.floorId}`);

  // ── Step 1: Login ─────────────────────────────────────────────────────
  log('Step 1 — Logging in...');
  const { status: loginStatus, json: loginJson } = await apiPost(
    '/v1/auth/login',
    {
      email: EMAIL,
      password: PASSWORD,
    },
  );

  if (loginStatus !== 200 || !loginJson.data) {
    fail(`Login failed (${loginStatus}): ${JSON.stringify(loginJson)}`);
    process.exit(1);
  }

  const token = (loginJson.data as { accessToken: string }).accessToken;
  ok(`Logged in as ${EMAIL}`);

  // ── Steps 2–4: One image at a time ────────────────────────────────────
  const imageFiles = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f));

  console.log(
    `\nFound ${imageFiles.length} image(s) in testDoors/: ${imageFiles.join(', ')}`,
  );

  const results: { file: string; imageId: string; role: string }[] = [];

  for (const filename of imageFiles) {
    const filePath = path.join(IMAGES_DIR, filename);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const role = ROLE_MAP[filename] ?? 'OTHER';
    const label = LABEL_MAP[filename] ?? filename;

    console.log(`\n  ──────────────────────────────────────`);
    console.log(`  File : ${filename}`);
    console.log(`  Role : ${role}`);
    console.log(`  Label: ${label}`);

    // Step 2 — Request signed URL
    const { status: s2, json: j2 } = await apiPost(
      `/v1/doors/${door.id}/images/signed-upload`,
      { role, contentType },
      token,
    );

    if (s2 !== 200 || !j2.data) {
      fail(`signed-upload failed (${s2}): ${JSON.stringify(j2)}`);
      continue;
    }

    const { signedUrl, objectPath, imageId } = j2.data as {
      signedUrl: string;
      objectPath: string;
      imageId: string;
    };
    ok(`Signed URL received (imageId: ${imageId})`);

    // Step 3 — PUT image binary to GCS
    let gcsStatus: number;
    try {
      gcsStatus = await putBinary(signedUrl, filePath, contentType);
    } catch (err) {
      fail(`GCS PUT threw an error: ${String(err)}`);
      fail('Registering with objectPath anyway so the record is saved...');
      gcsStatus = 0;
    }

    if (gcsStatus === 200) {
      ok(`GCS upload succeeded (HTTP 200)`);
    } else {
      fail(
        `GCS upload returned HTTP ${gcsStatus} — image may not be in bucket`,
      );
      console.log('     Proceeding to register so the DB record is created...');
    }

    // Step 4 — Register image in backend
    const { status: s4, json: j4 } = await apiPost(
      `/v1/doors/${door.id}/images/register`,
      { imageId, objectPath, role, label },
      token,
    );

    if (s4 === 201 && j4.data) {
      ok(`Registered in DB (record id: ${(j4.data as { id: string }).id})`);
      results.push({ file: filename, imageId, role });
    } else {
      fail(`register failed (${s4}): ${JSON.stringify(j4)}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    `  Results: ${results.length}/${imageFiles.length} images processed successfully`,
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (results.length > 0) {
    // Verify by listing images
    log('Verifying — fetching image list from API...');
    const listRes = await fetch(`${BASE_URL}/v1/doors/${door.id}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = (await listRes.json()) as { data?: unknown[] };
    const count = Array.isArray(listJson.data) ? listJson.data.length : '?';
    ok(`Door now has ${count} image(s) registered`);

    if (Array.isArray(listJson.data)) {
      (listJson.data as { role: string; label?: string; id: string }[]).forEach(
        (img, i) => {
          console.log(
            `    [${i + 1}] ${img.role.padEnd(20)} label: "${img.label ?? '—'}"  id: ${img.id}`,
          );
        },
      );
    }
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
