/**
 * Sets CORS configuration on the GCS bucket so browsers can PUT images directly.
 * Run once: npx tsx scripts/set-gcs-cors.ts
 */
import 'dotenv/config';
import { Storage } from '@google-cloud/storage';

const BUCKET_NAME = process.env['GCS_BUCKET_NAME'];
const KEY_FILE = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

if (!BUCKET_NAME) {
  console.error('❌  GCS_BUCKET_NAME not set in .env');
  process.exit(1);
}

const storage = new Storage({ ...(KEY_FILE ? { keyFilename: KEY_FILE } : {}) });

const corsConfig = [
  {
    origin: ['*'], // allow all origins (dev); tighten in prod
    method: ['PUT', 'GET', 'HEAD', 'OPTIONS'], // PUT for signed-URL upload, GET for download
    responseHeader: ['Content-Type', 'Content-Length', 'x-goog-meta-*'],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  console.log(`Setting CORS on bucket: ${BUCKET_NAME}`);
  const bucket = storage.bucket(BUCKET_NAME!);
  await bucket.setCorsConfiguration(corsConfig);

  // Verify
  const [meta] = await bucket.getMetadata();
  console.log('✅  CORS set successfully:');
  console.log(JSON.stringify(meta.cors, null, 2));
}

main().catch((err) => {
  console.error('❌  Failed:', (err as Error).message ?? err);
  process.exit(1);
});
