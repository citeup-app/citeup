/**
 * NOTE: This is used by `db seed` (prisma/seed.ts) but also when running test
 * suite (test/helpers/globalSetup.ts)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import debug from "debug";
import pg from "pg";
import { PrismaClient } from "prisma/generated/client";
import envVars from "./envVars";

// Strip ?sslmode from the URL before passing to pg. When pg parses
// ?sslmode=require (or verify-full) from the connection string it builds its
// own TLS config that silently overrides the ssl option passed to Pool(),
// causing "self-signed certificate" errors even with rejectUnauthorized:false.
// Deleting it here makes the explicit ssl option below the sole authority.
//
// prod-ca-2021.crt is NOT passed as cert: (client certificate) — that would
// send it to Supabase's pooler as a TLS client cert, which the pooler rejects
// before rejectUnauthorized is even evaluated. rejectUnauthorized only controls
// whether the client accepts the server's cert, not vice-versa.
const postgresUrl = new URL(envVars.POSTGRES_URL);
postgresUrl.searchParams.delete("sslmode");

const pool = new pg.Pool({
  connectionString: postgresUrl.toString(),
  max: 1,
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 0,
  allowExitOnIdle: true,
  ssl: process.env.NODE_ENV === "production" && { rejectUnauthorized: false },
});

export default new PrismaClient({
  adapter: new PrismaPg(pool),
  errorFormat: "pretty",
  log: debug.enabled("prisma") ? ["error", "warn", "query", "info"] : ["error"],
});
