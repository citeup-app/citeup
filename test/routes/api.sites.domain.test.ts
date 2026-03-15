import type { Route } from ".react-router/types/app/routes/+types/api.sites.$domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/api.sites.$domain";

const API_KEY = "cite.me.in_site_domain_test_key";
const DOMAIN = "api-site-domain-test.example";

function makeRequest(token?: string) {
  return new Request(`http://localhost/api/sites/${DOMAIN}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function callLoader(req: Request, domain = DOMAIN) {
  try {
    return await loader({ request: req, params: { domain }, context: {} } as Route.LoaderArgs);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe("api.sites.$domain", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: "api-site-domain-user-1" },
      create: {
        id: "api-site-domain-user-1",
        email: "api-site-domain-test@test.example",
        passwordHash: "test",
        apiKey: API_KEY,
        ownedSites: {
          create: { domain: DOMAIN },
        },
      },
      update: {
        apiKey: API_KEY,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: "api-site-domain-user-1" } });
  });

  it("returns 401 without a token", async () => {
    const res = await callLoader(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 for a domain this user doesn't own", async () => {
    const res = await callLoader(makeRequest(API_KEY), "other-domain.example");
    expect(res.status).toBe(404);
  });

  it("returns 200 with site data and users", async () => {
    const res = await callLoader(makeRequest(API_KEY));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.domain).toBe(DOMAIN);
    expect(body.createdAt).toBeDefined();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users[0].id).toBe("api-site-domain-user-1");
    expect(body.users[0].email).toBe("api-site-domain-test@test.example");
    expect(body.users[0].role).toBe("owner");
  });
});
