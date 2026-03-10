import { defineConfig } from "prisma/config";

// Production Prisma config — no dotenv (devDependency, not in prod image).
// DATABASE_URL is injected by Cloud Run via Secret Manager and read by the
// schema's `url = env("DATABASE_URL")` — do NOT override it here with
// datasource.url, as that breaks Cloud SQL Unix socket URLs (empty host).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
