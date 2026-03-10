import { defineConfig } from "prisma/config";

// Production Prisma config — DATABASE_URL is injected by Cloud Run via Secret Manager.
// dotenv is intentionally absent here (it's a devDependency not available in the prod image).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
