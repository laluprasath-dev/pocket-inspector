import { defineConfig } from "prisma/config";

// In production (Cloud Run) DATABASE_URL is injected as an environment variable
// from Secret Manager. In local dev it is loaded from the .env file by NestJS
// ConfigModule before any Prisma CLI command runs.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
