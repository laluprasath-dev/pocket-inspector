/**
 * Patches the Prisma-generated TypeScript client to remove the `import.meta.url`
 * line that breaks CommonJS compilation in Node.js v22+.
 *
 * Prisma 7.x generates TypeScript that uses `import.meta.url` to polyfill
 * `__dirname`.  When TypeScript compiles this to CommonJS (the project default),
 * the compiled `.js` still contains `import.meta.url`, which Node.js v22+
 * detects as ESM syntax and re-parses the file as an ES module — causing
 * "exports is not defined in ES module scope" at runtime.
 *
 * In CommonJS modules, `__dirname` is already available as a global, so the
 * polyfill is completely unnecessary and can be safely removed.
 */

'use strict';

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const clientPath = join(__dirname, '..', 'generated', 'prisma', 'client.ts');

let source = readFileSync(clientPath, 'utf8');

const ESM_DIRNAME_BLOCK =
  "import * as path from 'node:path'\n" +
  "import { fileURLToPath } from 'node:url'\n" +
  "globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))";

const CJS_DIRNAME_COMMENT =
  "// __dirname polyfill removed: already provided by the CommonJS runtime.";

if (source.includes(ESM_DIRNAME_BLOCK)) {
  source = source.replace(ESM_DIRNAME_BLOCK, CJS_DIRNAME_COMMENT);
  writeFileSync(clientPath, source, 'utf8');
  console.log('✔ Patched generated/prisma/client.ts — removed import.meta.url polyfill');
} else {
  console.log('ℹ  generated/prisma/client.ts — nothing to patch (already clean or changed)');
}
