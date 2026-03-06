/**
 * Internal CLI tool — create an ADMIN or INSPECTOR user directly in the database.
 * Never exposed as an HTTP endpoint.
 *
 * Usage:
 *   npm run user:create
 *
 * Or with flags to skip the prompts:
 *   npm run user:create -- --email jane@company.com --password "Secret123!" --role ADMIN --first-name Jane --last-name Smith
 *   npm run user:create -- --email joe@company.com  --password "Secret123!" --role INSPECTOR --org-id <orgId>
 */

import 'dotenv/config';
import * as readline from 'readline';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

// ── Arg helpers ──────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function rl(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function prompt(iface: readline.Interface, question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (hidden && process.stdout.isTTY) {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      let value = '';
      const handler = (buf: Buffer) => {
        const char = buf.toString();
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(value);
        } else if (char === '\u0003') {
          process.exit();
        } else if (char === '\u007f') {
          if (value.length > 0) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        } else {
          value += char;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', handler);
    } else {
      iface.question(question, resolve);
    }
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('\n❌  DATABASE_URL is not set. Check your .env file.\n');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const iface = rl();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pocket Inspector — Create User');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Collect inputs (flags or interactive prompts) ──

  let email = arg('--email') ?? '';
  while (!validateEmail(email)) {
    if (email) console.log('  ⚠  Invalid email address.');
    email = (await prompt(iface, '  Email: ')).trim();
  }

  let password = arg('--password') ?? '';
  let pwError = validatePassword(password);
  while (pwError) {
    if (password) console.log(`  ⚠  ${pwError}`);
    password = await prompt(iface, '  Password (min 8 chars, 1 uppercase, 1 number): ', true);
    pwError = validatePassword(password);
  }

  let role = (arg('--role') ?? '').toUpperCase();
  while (role !== 'ADMIN' && role !== 'INSPECTOR') {
    if (role) console.log('  ⚠  Role must be ADMIN or INSPECTOR.');
    role = (await prompt(iface, '  Role (ADMIN / INSPECTOR): ')).trim().toUpperCase();
  }

  const firstNameArg = arg('--first-name');
  const firstName = firstNameArg != null ? firstNameArg : ((await prompt(iface, '  First name (optional): ')).trim() || undefined);
  const lastNameArg = arg('--last-name');
  const lastName  = lastNameArg  != null ? lastNameArg  : ((await prompt(iface, '  Last name  (optional): ')).trim() || undefined);

  // ── Org: pick existing or use the only one ──────────────────────────────────

  const orgs = await prisma.org.findMany({ orderBy: { createdAt: 'asc' } });
  if (orgs.length === 0) {
    console.error('\n❌  No organisations found. Run `npm run db:seed` first.\n');
    await prisma.$disconnect();
    iface.close();
    process.exit(1);
  }

  let orgId = arg('--org-id') ?? '';

  if (!orgId) {
    if (orgs.length === 1) {
      orgId = orgs[0].id;
      console.log(`\n  ℹ  Using org: ${orgs[0].name} (${orgId})`);
    } else {
      console.log('\n  Available organisations:');
      orgs.forEach((o, i) => console.log(`    [${i + 1}] ${o.name}  —  ${o.id}`));
      let pick = '';
      while (!pick) {
        const raw = (await prompt(iface, `  Choose org [1-${orgs.length}]: `)).trim();
        const idx = parseInt(raw, 10) - 1;
        if (idx >= 0 && idx < orgs.length) pick = orgs[idx].id;
        else console.log('  ⚠  Invalid selection.');
      }
      orgId = pick;
    }
  }

  const org = orgs.find((o) => o.id === orgId);
  if (!org) {
    console.error(`\n❌  Org "${orgId}" not found.\n`);
    await prisma.$disconnect();
    iface.close();
    process.exit(1);
  }

  iface.close();

  // ── Summary before writing ──────────────────────────────────────────────────

  console.log('\n  ─────────────────────────────');
  console.log(`  Email     : ${email}`);
  console.log(`  Role      : ${role}`);
  console.log(`  Name      : ${[firstName, lastName].filter(Boolean).join(' ') || '(not set)'}`);
  console.log(`  Org       : ${org.name}`);
  console.log('  ─────────────────────────────\n');

  // ── Write to database ───────────────────────────────────────────────────────

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`❌  A user with email "${email}" already exists.\n`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, role: role as 'ADMIN' | 'INSPECTOR', orgId, firstName, lastName },
  });

  console.log(`✅  User created successfully!`);
  console.log(`   ID    : ${user.id}`);
  console.log(`   Email : ${user.email}`);
  console.log(`   Role  : ${user.role}`);
  console.log(`   Org   : ${org.name}\n`);

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error('\n❌  Unexpected error:', err);
  process.exit(1);
});
