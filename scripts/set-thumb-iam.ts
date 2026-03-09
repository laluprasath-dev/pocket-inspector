/**
 * Grants allUsers storage.objectViewer on the thumb path prefix only.
 *
 * This allows thumbnails to be served as permanent public URLs
 * (https://storage.googleapis.com/<bucket>/<path>) without signed URLs,
 * while keeping original inspection images fully private.
 *
 * Requires: Uniform Bucket-Level Access must be enabled (it is).
 * Credentials: needs storage.buckets.setIamPolicy — use the Firebase Admin key.
 *
 * Run once:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/pocket-inspector-production-firebase-adminsdk-fbsvc-dbda2bd3b2.json \
 *   npm run gcs:set-thumb-iam
 */
import 'dotenv/config';
import { Storage } from '@google-cloud/storage';

const BUCKET_NAME = process.env['GCS_BUCKET_NAME'];
const KEY_FILE = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

if (!BUCKET_NAME) {
  console.error('❌  GCS_BUCKET_NAME not set in .env');
  process.exit(1);
}

const storage = new Storage({ keyFilename: KEY_FILE });

async function main() {
  const bucket = storage.bucket(BUCKET_NAME!);

  console.log(`\nSetting IAM policy on bucket: ${BUCKET_NAME}`);
  console.log('  → granting allUsers objectViewer on */thumb/* prefix\n');

  // Get current policy so we don't clobber existing bindings
  const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });

  // Remove any previous allUsers thumb binding to avoid duplicates
  policy.bindings = (policy.bindings ?? []).filter(
    (b) =>
      !(
        b.role === 'roles/storage.objectViewer' &&
        b.members?.includes('allUsers') &&
        b.condition?.title === 'thumb-prefix-public'
      ),
  );

  // Add the new conditional binding
  policy.bindings.push({
    role: 'roles/storage.objectViewer',
    members: ['allUsers'],
    condition: {
      title: 'thumb-prefix-public',
      description: 'Allow public read on thumbnail objects only',
      expression:
        'resource.name.matches("projects/_/buckets/' +
        BUCKET_NAME +
        '/objects/.*/images/thumb/.*")',
    },
  });

  // etag must match (3 = supports conditions)
  policy.version = 3;
  await bucket.iam.setPolicy(policy);

  console.log('✅  IAM policy updated. Thumbnails are now publicly readable.');
  console.log(
    `\n   Test URL: https://storage.googleapis.com/${BUCKET_NAME}/orgs/.../images/thumb/...`,
  );
  console.log('   Original images remain private (require signed URLs).\n');
}

main().catch((err) => {
  console.error('❌  Failed:', (err as Error).message ?? err);
  process.exit(1);
});
