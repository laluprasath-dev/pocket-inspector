/**
 * Backfill thumbnail generation for door images where objectPathThumb is null.
 *
 * Usage:
 *   npm run backfill:thumbnails
 *
 * Safe to re-run — only processes images where objectPathThumb IS NULL.
 * Skips images where the original does not exist in GCS.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { Storage } from '@google-cloud/storage';
import { StoragePathBuilder } from '../src/modules/storage/storage-path.builder';
import sharp from 'sharp';

const THUMB_SIZE = 400;
const CONCURRENCY = 3; // process N images at a time
const THUMB_QUALITY = 75;

// ── Init ──────────────────────────────────────────────────────────────────────
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }),
});

const gcs = new Storage({
  projectId: process.env['GCS_PROJECT_ID'],
  keyFilename: process.env['GOOGLE_APPLICATION_CREDENTIALS'],
});
const bucket = gcs.bucket(process.env['GCS_BUCKET_NAME']!);

// ── Helpers ───────────────────────────────────────────────────────────────────

let processed = 0,
  succeeded = 0,
  skipped = 0,
  failed = 0;

function log(icon: string, msg: string) {
  process.stdout.write(`  ${icon}  ${msg}\n`);
}

async function fileExists(path: string): Promise<boolean> {
  const [exists] = await bucket.file(path).exists();
  return exists;
}

async function generateThumb(
  originalPath: string,
  thumbPath: string,
): Promise<void> {
  const readStream = bucket.file(originalPath).createReadStream();
  const writeStream = bucket.file(thumbPath).createWriteStream({
    contentType: 'image/jpeg',
    resumable: false,
  });

  const resizer = sharp()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY });

  await new Promise<void>((resolve, reject) => {
    readStream
      .on('error', reject)
      .pipe(resizer)
      .on('error', reject)
      .pipe(writeStream)
      .on('finish', resolve)
      .on('error', reject);
  });
}

async function processImage(img: {
  id: string;
  doorId: string;
  role: string;
  objectPathOriginal: string;
  door: {
    floor: {
      id: string;
      building: { id: string; siteId: string | null; orgId: string };
    };
  };
}) {
  processed++;
  const label = `[${processed}] ${img.role} — ${img.id.slice(0, 12)}`;

  const originalExists = await fileExists(img.objectPathOriginal);
  if (!originalExists) {
    log('⏭', `${label} — original not in GCS, skipping`);
    skipped++;
    return;
  }

  // Build thumb path using the same builder the service uses
  const thumbPath = StoragePathBuilder.doorImageThumb({
    orgId: img.door.floor.building.orgId,
    siteId: img.door.floor.building.siteId,
    buildingId: img.door.floor.building.id,
    floorId: img.door.floor.id,
    doorId: img.doorId,
    role: img.role as Parameters<
      typeof StoragePathBuilder.doorImageThumb
    >[0]['role'],
    imageId: img.id,
  });

  try {
    await generateThumb(img.objectPathOriginal, thumbPath);

    await db.doorImage.update({
      where: { id: img.id },
      data: { objectPathThumb: thumbPath },
    });

    log(
      '✅',
      `${label} → thumb/${img.role.toLowerCase()}/${img.id.slice(0, 8)}...jpg`,
    );
    succeeded++;
  } catch (err) {
    log('❌', `${label} — ${String(err).split('\n')[0]}`);
    failed++;
  }
}

// ── Make existing thumbs public ───────────────────────────────────────────────

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pocket Inspector — Thumbnail Backfill');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const images = await db.doorImage.findMany({
    where: {
      objectPathThumb: null,
      objectPathOriginal: { not: '' },
    },
    include: {
      door: {
        include: {
          floor: {
            include: {
              building: { select: { id: true, siteId: true, orgId: true } },
            },
          },
        },
      },
    },
    orderBy: { uploadedAt: 'asc' },
  });

  if (images.length === 0) {
    console.log('  ✅  No images need thumbnails — all up to date!\n');
    await db.$disconnect();
    return;
  }

  console.log(
    `  Found ${images.length} image(s) with no thumbnail. Processing ${CONCURRENCY} at a time...\n`,
  );

  // Process in batches of CONCURRENCY
  for (let i = 0; i < images.length; i += CONCURRENCY) {
    const batch = images.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processImage));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total   : ${images.length}`);
  console.log(`  ✅ Done : ${succeeded}`);
  console.log(`  ⏭ Skip  : ${skipped}  (original missing in GCS)`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('\nFatal:', err);
  await db.$disconnect();
  process.exit(1);
});
