import { defineConfig } from "prisma/config";

// Production Prisma config — no dotenv (devDependency, not in prod image).
// DATABASE_URL is injected by Cloud Run via Secret Manager.
// Note: the secret uses @localhost/db?host=/cloudsql/... format so Prisma's
// URL validator passes (it rejects the bare @/db empty-host form).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
