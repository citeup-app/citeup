import type { Route } from ".react-router/types/app/routes/+types/api.me";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/api.me";

const API_KEY = "cite.me.in_me_test_key_abc123";

function makeRequest(token?: string) {
  return new Request("http://localhost/api/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function callLoader(req: Request) {
  try {
    return await loader({ request: req, params: {}, context: {} } as Route.LoaderArgs);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe("api.me", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: "api-me-test-user-1" },
      create: {
        id: "api-me-test-user-1",
        email: "api-me-test@test.example",
        passwordHash: "test",
        apiKey: API_KEY,
        ownedSites: {
          create: { domain: "api-me-test.example.com" },
        },
      },
      update: {
        apiKey: API_KEY,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: "api-me-test-user-1" } });
  });

  it("returns 401 without a token", async () => {
    const res = await callLoader(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong token", async () => {
    const res = await callLoader(makeRequest("wrong-token"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct token and includes user data", async () => {
    const res = await callLoader(makeRequest(API_KEY));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("api-me-test-user-1");
    expect(body.email).toBe("api-me-test@test.example");
    expect(body.createdAt).toBeDefined();
    expect(Array.isArray(body.sites)).toBe(true);
    expect(body.sites[0].domain).toBe("api-me-test.example.com");
  });
});
