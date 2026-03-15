import type { Route } from ".react-router/types/app/routes/+types/api.sites.$domain_.runs.$runId";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/api.sites.$domain_.runs.$runId";

const API_KEY = "cite.me.in_run_detail_key_xyz";
const DOMAIN = "api-run-detail-test.example";
const RUN_ID = "api-run-detail-run-1";

function makeRequest(token?: string) {
  return new Request(`http://localhost/api/sites/${DOMAIN}/runs/${RUN_ID}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function callLoader(req: Request, domain = DOMAIN, runId = RUN_ID) {
  try {
    return await loader({ request: req, params: { domain, runId }, context: {} } as Route.LoaderArgs);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

describe("api.sites.$domain_.runs.$runId", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: "api-run-detail-user-1" },
      create: {
        id: "api-run-detail-user-1",
        email: "api-run-detail@test.example",
        passwordHash: "test",
        apiKey: API_KEY,
        ownedSites: {
          create: {
            domain: DOMAIN,
            citationRuns: {
              create: {
                id: RUN_ID,
                platform: "chatgpt",
                model: "gpt-4o",
                queries: {
                  create: {
                    query: "test run detail query",
                    group: "test group",
                    extraQueries: [],
                    text: "test response",
                    position: 1,
                    citations: ["https://api-run-detail-test.example/report"],
                  },
                },
              },
            },
          },
        },
      },
      update: {
        apiKey: API_KEY,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: "api-run-detail-user-1" } });
  });

  it("returns 401 without a token", async () => {
    const res = await callLoader(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown runId", async () => {
    const res = await callLoader(makeRequest(API_KEY), DOMAIN, "nonexistent-run-id");
    expect(res.status).toBe(404);
  });

  it("returns 200 with run detail", async () => {
    const res = await callLoader(makeRequest(API_KEY));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(RUN_ID);
    expect(body.platform).toBe("chatgpt");
    expect(body.model).toBe("gpt-4o");
    expect(body.createdAt).toBeDefined();
    expect(Array.isArray(body.queries)).toBe(true);
    expect(body.queries).toHaveLength(1);

    const query = body.queries[0];
    expect(query.id).toBeDefined();
    expect(query.query).toBe("test run detail query");
    expect(query.group).toBe("test group");
    expect(query.position).toBe(1);
    expect(query.citations).toEqual(["https://api-run-detail-test.example/report"]);
  });
});
