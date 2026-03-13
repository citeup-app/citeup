#!/usr/bin/env tsx
/**
 * Migration script: Move from Account-based to User-based site ownership.
 *
 * For each account:
 * 1. The oldest user becomes the owner of all sites
 * 2. Additional users become members (SiteUser records)
 * 3. Sites get a generated apiKey
 * 4. UsageEvents are assigned to the first site
 *
 * Run once: npx tsx scripts/migrate-user-site.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { generateApiKey } from "random-password-toolkit";
import { PrismaClient } from "../prisma/generated/client.js";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) throw new Error("POSTGRES_URL environment variable is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  // Read accounts via raw SQL (Account model removed from Prisma schema)
  const accounts = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM accounts ORDER BY created_at ASC
  `;

  console.log(`Found ${accounts.length} accounts to migrate`);

  for (const account of accounts) {
    // Get users for this account (oldest first)
    const users = await prisma.$queryRaw<{ id: string; email: string }[]>`
      SELECT id, email FROM users WHERE account_id = ${account.id} ORDER BY created_at ASC
    `;

    if (users.length === 0) {
      console.log(`Account ${account.id}: no users, skipping`);
      continue;
    }

    const owner = users[0];
    const members = users.slice(1);

    // Get sites for this account
    const sites = await prisma.$queryRaw<{ id: string; domain: string }[]>`
      SELECT id, domain FROM sites WHERE account_id = ${account.id}
    `;

    console.log(
      `Account ${account.id}: owner=${owner.email}, sites=${sites.length}, extra users=${members.length}`,
    );

    for (const site of sites) {
      const apiKey = `cite.me.in_${generateApiKey(16)}`;

      // Set ownerId and apiKey
      await prisma.$executeRaw`
        UPDATE sites SET owner_id = ${owner.id}, api_key = ${apiKey}
        WHERE id = ${site.id}
      `;

      // Create SiteUser records for additional users
      for (const member of members) {
        await prisma.$executeRaw`
          INSERT INTO site_users (site_id, user_id, created_at)
          VALUES (${site.id}, ${member.id}, NOW())
          ON CONFLICT (site_id, user_id) DO NOTHING
        `;
      }
    }

    // Migrate UsageEvents to first site (best-effort)
    if (sites.length > 0) {
      await prisma.$executeRaw`
        UPDATE usage_events SET site_id = ${sites[0].id}
        WHERE account_id = ${account.id}
      `;
    }
  }

  console.log("Migration complete.");
  console.log(
    "NOTE: Existing bot tracking API keys have changed. Users need to update their tracking scripts.",
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
