/**
 * Patches the Prisma-generated client.ts to replace `import.meta.url` with
 * the CJS-native `__dirname`. Node.js 22+ treats any .js file containing
 * `import.meta` as ESM, causing "exports is not defined" when required as CJS.
 *
 * Run automatically via `postprisma:generate` in package.json.
 */
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_PATH = path.join(
  __dirname,
  '..',
  'generated',
  'prisma',
  'client.ts',
);

const BEFORE = `import { fileURLToPath } from 'node:url'
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))`;

const AFTER = `// Use CJS __dirname directly (avoids import.meta.url which breaks Node.js CJS loader in v22+)
globalThis['__dirname'] = __dirname`;

const src = fs.readFileSync(CLIENT_PATH, 'utf8');

if (src.includes(AFTER)) {
  console.log('✅  prisma client.ts already patched — skipping');
  process.exit(0);
}

if (!src.includes('import.meta.url')) {
  console.log('ℹ️   No import.meta.url found in client.ts — nothing to patch');
  process.exit(0);
}

const patched = src
  .replace(BEFORE, AFTER)
  .replace(/^import \{ fileURLToPath \} from 'node:url'\n?/m, '');

fs.writeFileSync(CLIENT_PATH, patched, 'utf8');
console.log('✅  Patched generated/prisma/client.ts — removed import.meta.url');
