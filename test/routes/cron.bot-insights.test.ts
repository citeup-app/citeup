import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/lib/prisma.server";
import { port } from "../helpers/launchBrowser";

async function makeRequest(auth?: string) {
  return await fetch(`http://localhost:${port}/cron/bot-insights`, {
    headers: { authorization: `Bearer ${auth}` },
  });
}

describe("cron.bot-insights", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    vi.clearAllMocks();
  });

  describe("auth", () => {
    it("should return 401 without Authorization header", async () => {
      const res = await makeRequest();
      expect(res.status).toBe(401);
    });

    it("should return 401 with wrong token", async () => {
      const res = await makeRequest("wrong");
      expect(res.status).toBe(401);
    });

    it("should return 200 with correct token", async () => {
      const res = await makeRequest("test-cron-secret");
      expect(res.status).toBe(200);
    });
  });

  describe("site selection", () => {
    it("returns empty results when no sites have recent visits", async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await prisma.site.create({
        data: {
          id: "site-cron-insights-1",
          domain: "old-visits.example.com",
          apiKey: "test-api-key-cron-insights-1",
          owner: {
            create: {
              id: "user-cron-insights-1",
              email: "cron1@test.com",
              passwordHash: "test",
            },
          },
          botVisits: {
            create: {
              botType: "ChatGPT",
              userAgent: "GPTBot/1.0",
              path: "/",
              accept: [],
              count: 5,
              date: oldDate,
              firstSeen: oldDate,
              lastSeen: oldDate,
            },
          },
        },
      });

      const res = await makeRequest("test-cron-secret");
      const body = await res.json();
      expect(body.results).toHaveLength(0);
      expect(await prisma.botInsight.count()).toBe(0);
    });

    it("upserts BotInsight for site with a visit in the last 24h", async () => {
      const recentDate = new Date();
      await prisma.site.create({
        data: {
          id: "site-cron-insights-2",
          domain: "recent-visits.example.com",
          apiKey: "test-api-key-cron-insights-2",
          owner: {
            create: {
              id: "user-cron-insights-2",
              email: "cron2@test.com",
              passwordHash: "test",
            },
          },
          botVisits: {
            create: {
              botType: "ChatGPT",
              userAgent: "GPTBot/1.0",
              path: "/",
              accept: [],
              count: 8,
              date: recentDate,
              firstSeen: recentDate,
              lastSeen: recentDate,
            },
          },
        },
      });

      const res = await makeRequest("test-cron-secret");
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.results).toHaveLength(1);
      expect(body.results[0]).toEqual({
        siteId: "site-cron-insights-2",
        ok: true,
      });

      const insight = await prisma.botInsight.findUnique({
        where: { siteId: "site-cron-insights-2" },
      });
      expect(insight?.content).toBe("No results found.");
    });

    it("re-upserts on second run (idempotent)", async () => {
      const recentDate = new Date();
      await prisma.site.create({
        data: {
          id: "site-cron-insights-3",
          domain: "idempotent.example.com",
          apiKey: "test-api-key-cron-insights-3",
          owner: {
            create: {
              id: "user-cron-insights-3",
              email: "cron3@test.com",
              passwordHash: "test",
            },
          },
          botVisits: {
            create: {
              botType: "Perplexity",
              userAgent: "PerplexityBot/1.0",
              path: "/about",
              accept: [],
              count: 3,
              date: recentDate,
              firstSeen: recentDate,
              lastSeen: recentDate,
            },
          },
        },
      });

      await makeRequest("test-cron-secret");
      await makeRequest("test-cron-secret");

      expect(await prisma.botInsight.count()).toBe(1);
    });
  });
});
