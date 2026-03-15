import type { Route } from ".react-router/types/app/routes/+types/api.admin.users";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/api.admin.users";

const ADMIN_SECRET = "test-admin-secret-admin-users";

function makeRequest(token?: string) {
  return new Request("http://localhost/api/admin/users", {
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

describe("api.admin.users", () => {
  beforeAll(() => {
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it("returns 401 without a token", async () => {
    const res = await callLoader(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong token", async () => {
    const res = await callLoader(makeRequest("wrong-token"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct token and includes seeded user", async () => {
    await prisma.user.create({
      data: {
        id: "admin-users-test-user-1",
        email: "admin-users-test@test.example",
        passwordHash: "test",
        ownedSites: {
          create: {
            domain: "admin-users-test.example.com",
          },
        },
      },
    });

    const res = await callLoader(makeRequest(ADMIN_SECRET));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("users");
    expect(Array.isArray(body.users)).toBe(true);

    const user = body.users.find(
      (u: { id: string }) => u.id === "admin-users-test-user-1",
    );
    expect(user).toBeDefined();
    expect(user.id).toBe("admin-users-test-user-1");
    expect(user.email).toBe("admin-users-test@test.example");
    expect(user.createdAt).toBeDefined();
    expect(Array.isArray(user.sites)).toBe(true);
    expect(user.sites[0].domain).toBe("admin-users-test.example.com");
  });
});
