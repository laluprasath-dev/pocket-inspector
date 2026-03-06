import { defineConfig } from "prisma/config";
import "dotenv/config"; // no-op if .env is absent (e.g. Cloud Run); safe in both envs

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
