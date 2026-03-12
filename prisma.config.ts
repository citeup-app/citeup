import dotenv from "dotenv";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

dotenv.configDotenv({ quiet: true, path: ".env.local" });
dotenv.configDotenv({ quiet: true });

// @see https://www.prisma.io/docs/orm/overview/databases/supabase#specific-considerations
export default defineConfig({
  datasource: {
    // Use process.env directly so prisma generate doesn't throw when the var
    // is absent (e.g. on a build server that has no DB access).
    url: process.env.POSTGRES_PRISMA_URL,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm tsx prisma/seed.ts",
  },
  schema: "prisma/schema.prisma",
  typedSql: { path: resolve("prisma", "sql") },
});
