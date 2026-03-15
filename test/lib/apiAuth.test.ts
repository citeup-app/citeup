import { beforeAll, describe, expect, it } from "vitest";
import { requireAdminApiKey, verifySiteAccess } from "~/lib/api/apiAuth.server";
import { hashPassword } from "~/lib/auth.server";
import envVars from "~/lib/envVars";
import prisma from "~/lib/prisma.server";

const TEST_ADMIN_SECRET = "test-admin-secret-xyz";

function makeRequest(token?: string) {
  return new Request("http://localhost/api/test", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("requireAdminApiKey", () => {
  beforeAll(() => {
    envVars.ADMIN_API_SECRET = TEST_ADMIN_SECRET;
  });

  it("resolves when token matches ADMIN_API_SECRET", async () => {
    await expect(
      requireAdminApiKey(makeRequest(TEST_ADMIN_SECRET)),
    ).resolves.toBeUndefined();
  });

  it("throws 401 Response when token is wrong", async () => {
    const err = await requireAdminApiKey(makeRequest("wrong")).catch((e) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(401);
  });

  it("throws 401 Response when no Authorization header", async () => {
    const err = await requireAdminApiKey(makeRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(401);
  });
});

describe("verifySiteAccess", () => {
  const userId = "api-auth-test-user-1";
  const siteId = "test-site-1";
  const userApiKey = "cite.me.in_test_auth_key_abc123xyz";

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-auth-test@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
        ownedSites: {
          create: {
            id: siteId,
            domain: "test.example",
            apiKey: userApiKey,
          },
        },
      },
      update: { apiKey: userApiKey },
    });
  });

  it("returns site when token matches", async () => {
    const site = await verifySiteAccess({
      domain: "test.example",
      request: makeRequest(userApiKey),
    });
    expect(site.id).toBe(siteId);
  });

  it("throws 404 Response when token is unknown", async () => {
    await expect(
      verifySiteAccess({
        domain: "test.example",
        request: makeRequest("unknown-key"),
      }),
    ).rejects.toThrow(Response);
  });

  it("throws 404 Response when domain is unknown", async () => {
    await expect(
      verifySiteAccess({
        domain: "unknown.example",
        request: makeRequest(),
      }),
    ).rejects.toThrow(Response);
  });
});
