import { beforeAll, describe, expect, it } from "vitest";
import envVars from "~/lib/envVars";
import prisma from "~/lib/prisma.server";
import { port } from "../helpers/launchBrowser";

function makeRequest(token?: string) {
  return fetch(`http://localhost:${port}/api/admin/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("api.admin.users", () => {
  it("should return 401 without a token", async () => {
    const res = await makeRequest();
    expect(res.status).toBe(401);
  });

  it("should return 401 with a wrong token", async () => {
    const res = await makeRequest("wrong-token");
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

      response = await makeRequest(envVars.ADMIN_API_SECRET);
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
