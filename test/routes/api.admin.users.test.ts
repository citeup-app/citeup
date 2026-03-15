import type { Route } from ".react-router/types/app/routes/+types/api.admin.users";
import { beforeAll, describe, expect, it } from "vitest";
import envVars from "~/lib/envVars";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/api.admin.users";

function makeRequest(token?: string) {
  return new Request("http://localhost/api/admin/users", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function callLoader(req: Request) {
  try {
    return await loader({
      request: req,
      params: {},
      context: {},
    } as Route.LoaderArgs);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe("api.admin.users", () => {
  it("should return 401 without a token", async () => {
    const res = await callLoader(makeRequest());
    expect(res.status).toBe(401);
  });

  it("should return 401 with a wrong token", async () => {
    const res = await callLoader(makeRequest("wrong-token"));
    expect(res.status).toBe(401);
  });

  describe("with a correct token", () => {
    let response: Response;
    let body: {
      users: {
        id: string;
        email: string;
        createdAt: string;
        sites: {
          domain: string;
          createdAt: string;
        }[];
      }[];
    };

    beforeAll(async () => {
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

      response = await callLoader(makeRequest(envVars.ADMIN_API_SECRET));
    });

    it("should return 200", async () => {
      expect(response.status).toBe(200);
      body = await response.json();
    });

    it("should return the seeded user", async () => {
      expect(body).toHaveProperty("users");
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users[0].id).toBe("admin-users-test-user-1");
      expect(body.users[0].email).toBe("admin-users-test@test.example");
      expect(body.users[0].createdAt).toBeDefined();
      expect(Array.isArray(body.users[0].sites)).toBe(true);
    });

    it("should return the seeded user's sites", async () => {
      expect(body.users[0].sites).toBeDefined();
      expect(Array.isArray(body.users[0].sites)).toBe(true);
      expect(body.users[0].sites[0].domain).toBe(
        "admin-users-test.example.com",
      );
      expect(body.users[0].sites[0].createdAt).toBeDefined();
    });
  });
});
