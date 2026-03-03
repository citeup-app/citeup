# Bot Insights Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Generate a plain-English summary of the last 7 days of AI bot crawl activity for each site, cache it in the database, and surface it at the top of the /bots page.

**Architecture:** A new `BotInsight` model (one row per site, unique on `siteId`) holds the cached LLM-generated insight. A new Vercel cron route (`cron.bot-insights`) runs daily at noon UTC (4am PST), finds sites with bot visits in the last 24h, aggregates their 7-day visit data, calls `generateBotInsight` (haiku), and upserts the row. The bots page loader fetches the cached insight and renders it as a callout card above the stats grid if one exists.

**Tech stack:** Prisma (PostgreSQL), `generateText` via `@ai-sdk/anthropic` haiku, Vercel cron, `@js-temporal/polyfill` for date arithmetic, Vitest + Playwright for tests.

---

### Task 1: Schema — add BotInsight model

**Files:**
- Modify: `prisma/schema.prisma`

**Context:** The schema is at `prisma/schema.prisma`. After every schema change you must run two commands: `pnpm prisma db push` (applies to the DB) then `pnpm prisma generate` (regenerates the Prisma client in `prisma/generated/`). All child relations use `onDelete: Cascade`. Every mutable model has `updatedAt DateTime @map("updated_at") @updatedAt`.

**Step 1: Add BotInsight model to schema**

Open `prisma/schema.prisma`. Add the following model after the `BotVisit` model (after line 46):

```prisma
model BotInsight {
  id          String   @id @default(cuid())
  createdAt   DateTime @map("created_at") @default(now())
  updatedAt   DateTime @map("updated_at") @updatedAt
  siteId      String   @map("site_id") @unique
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  content     String   @map("content")
  generatedAt DateTime @map("generated_at")

  @@map("bot_insights")
}
```

**Step 2: Add back-relation to Site model**

In the `Site` model (around line 130), add `botInsight` after `botVisits BotVisit[]`:

```prisma
  botInsight   BotInsight?
```

**Step 3: Apply schema to DB and regenerate client**

```bash
pnpm prisma db push
pnpm prisma generate
```

Expected: both commands complete without errors. The Prisma client in `prisma/generated/` now includes `prisma.botInsight`.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/generated/
git commit -m "feat: add BotInsight model to schema"
```

---

### Task 2: generateBotInsight function + unit test

**Files:**
- Create: `app/lib/llm-visibility/generateBotInsight.ts`
- Create: `test/llm-visibility/generateBotInsight.test.ts`

**Context:** Follow the exact pattern of `app/lib/llm-visibility/generateSiteQueries.ts`. Use `generateText` from `"ai"` and the `haiku` model from `~/lib/llm-visibility/anthropic`. The test mocks both `"ai"` and `~/lib/llm-visibility/anthropic` using `vi.mock`, matching the pattern in `test/lib/generateSiteQueries.test.ts` and `test/llm-visibility/claudeClient.test.ts`.

**Step 1: Write the failing tests**

Create `test/llm-visibility/generateBotInsight.test.ts`:

```ts
import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import generateBotInsight from "~/lib/llm-visibility/generateBotInsight";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("~/lib/llm-visibility/anthropic", () => ({
  haiku: "mock-haiku-model",
}));

describe("generateBotInsight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the text from generateText", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "GPTBot visited 47 times this week.",
    } as never);

    const result = await generateBotInsight("example.com", [
      { botType: "ChatGPT", total: 47, topPaths: ["/", "/blog"] },
    ]);

    expect(result).toBe("GPTBot visited 47 times this week.");
  });

  it("includes domain and bot stats in the user message", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "insight" } as never);

    await generateBotInsight("mysite.com", [
      { botType: "Claude", total: 5, topPaths: ["/about"] },
      { botType: "Perplexity", total: 12, topPaths: ["/", "/faq"] },
    ]);

    const call = vi.mocked(generateText).mock.calls[0][0];
    const messages = call.messages as { role: string; content: string }[];
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("Domain: mysite.com");
    expect(userMsg?.content).toContain("Claude: 5 visits");
    expect(userMsg?.content).toContain("Perplexity: 12 visits");
  });

  it("propagates errors from generateText", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("API error"));

    await expect(
      generateBotInsight("example.com", []),
    ).rejects.toThrow("API error");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/llm-visibility/generateBotInsight.test.ts
```

Expected: FAIL — "Cannot find module '~/lib/llm-visibility/generateBotInsight'"

**Step 3: Implement generateBotInsight**

Create `app/lib/llm-visibility/generateBotInsight.ts`:

```ts
import { generateText } from "ai";
import { haiku } from "./anthropic";

type BotStat = {
  botType: string;
  total: number;
  topPaths: string[];
};

export default async function generateBotInsight(
  domain: string,
  botStats: BotStat[],
): Promise<string> {
  const statLines = botStats
    .map(
      (s) =>
        `- ${s.botType}: ${s.total} visits. Top pages: ${s.topPaths.join(", ")}`,
    )
    .join("\n");

  const { text } = await generateText({
    model: haiku,
    messages: [
      {
        role: "system" as const,
        content:
          "You are a concise analytics assistant. Write 3–5 plain-English sentences summarizing which AI bots are crawling a website. Focus on the most active bots and which pages they visit most. Be direct — no preamble, no 'In summary'. One observation per sentence.",
      },
      {
        role: "user" as const,
        content: `Domain: ${domain}\nLast 7 days of bot activity:\n${statLines}`,
      },
    ],
    maxOutputTokens: 300,
  });

  return text;
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/llm-visibility/generateBotInsight.test.ts
```

Expected: 3 tests PASS.

**Step 5: Commit**

```bash
git add app/lib/llm-visibility/generateBotInsight.ts test/llm-visibility/generateBotInsight.test.ts
git commit -m "feat: add generateBotInsight function"
```

---

### Task 3: Cron route + test + Vercel schedule

**Files:**
- Create: `app/routes/cron.bot-insights.ts`
- Create: `test/routes/cronBotInsights.test.ts`
- Modify: `.vercel/vercel.json`

**Context:** Follow the pattern of `app/routes/cron.citation-runs.ts` for auth and error handling. Use `@js-temporal/polyfill` for date arithmetic (already a dependency — see `app/lib/llm-visibility/queryPlatform.ts` for usage examples). The test imports the `loader` directly (no HTTP server needed) and mocks `generateBotInsight` and `envVars`. Fixed seed IDs use the `cron-insights-` prefix to avoid conflicts with other test files.

The cron test is a Vitest module-level test (not a Playwright/HTTP test). It imports the route loader directly and calls it with a constructed `Request` object. Vitest's `vi.mock` hoisting ensures `generateBotInsight` is mocked before the loader module loads.

**Step 1: Write the failing tests**

Create `test/routes/cronBotInsights.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/lib/prisma.server";
import { loader } from "~/routes/cron.bot-insights";

vi.mock("~/lib/envVars", () => ({
  default: { CRON_SECRET: "test-secret" },
}));

vi.mock("~/lib/llm-visibility/generateBotInsight", () => ({
  default: vi.fn().mockResolvedValue("ChatGPT visited 8 times this week."),
}));

vi.mock("@sentry/react-router", () => ({
  captureException: vi.fn(),
}));

function makeRequest(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/cron/bot-insights", { headers });
}

// biome-ignore lint/suspicious/noExplicitAny: loader args in test context
function callLoader(req: Request) {
  return loader({ request: req, params: {}, context: {} } as any);
}

describe("cron.bot-insights", () => {
  beforeEach(async () => {
    await prisma.account.deleteMany();
    vi.clearAllMocks();
  });

  describe("auth", () => {
    it("returns 401 without Authorization header", async () => {
      const res = await callLoader(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await callLoader(makeRequest("Bearer wrong"));
      expect(res.status).toBe(401);
    });

    it("returns 200 with correct token", async () => {
      const res = await callLoader(makeRequest("Bearer test-secret"));
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
          account: { create: { id: "account-cron-insights-1" } },
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

      const res = await callLoader(makeRequest("Bearer test-secret"));
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
          account: { create: { id: "account-cron-insights-2" } },
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

      const res = await callLoader(makeRequest("Bearer test-secret"));
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
      expect(insight?.content).toBe("ChatGPT visited 8 times this week.");
    });

    it("re-upserts on second run (idempotent)", async () => {
      const recentDate = new Date();
      await prisma.site.create({
        data: {
          id: "site-cron-insights-3",
          domain: "idempotent.example.com",
          account: { create: { id: "account-cron-insights-3" } },
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

      await callLoader(makeRequest("Bearer test-secret"));
      await callLoader(makeRequest("Bearer test-secret"));

      expect(await prisma.botInsight.count()).toBe(1);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/cronBotInsights.test.ts
```

Expected: FAIL — "Cannot find module '~/routes/cron.bot-insights'"

**Step 3: Implement the cron route**

Create `app/routes/cron.bot-insights.ts`:

```ts
import { captureException } from "@sentry/react-router";
import { Temporal } from "@js-temporal/polyfill";
import envVars from "~/lib/envVars";
import generateBotInsight from "~/lib/llm-visibility/generateBotInsight";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/cron.bot-insights";

// Vercel Cron fires a GET with Authorization: Bearer <CRON_SECRET>.
export async function loader({ request }: Route.LoaderArgs) {
  const cronSecret = envVars.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${cronSecret}`)
      return new Response("Unauthorized", { status: 401 });
  }

  const since = new Date(
    Temporal.Now.instant().subtract({ hours: 24 }).epochMilliseconds,
  );

  const sites = await prisma.site.findMany({
    where: { botVisits: { some: { date: { gte: since } } } },
    select: { id: true, domain: true },
  });

  console.info(
    "[cron:bot-insights] Sites with recent visits: %s",
    sites.map((s) => s.domain).join(", "),
  );

  const results: { siteId: string; ok: boolean; error?: string }[] = [];

  for (const site of sites) {
    try {
      const sevenDaysAgo = new Date(
        Temporal.Now.instant().subtract({ hours: 24 * 7 }).epochMilliseconds,
      );

      const visits = await prisma.botVisit.findMany({
        where: { siteId: site.id, date: { gte: sevenDaysAgo } },
        select: { botType: true, path: true, count: true },
      });

      const byBot: Record<
        string,
        { total: number; pathCounts: Record<string, number> }
      > = {};
      for (const v of visits) {
        if (!byBot[v.botType])
          byBot[v.botType] = { total: 0, pathCounts: {} };
        byBot[v.botType].total += v.count;
        byBot[v.botType].pathCounts[v.path] =
          (byBot[v.botType].pathCounts[v.path] ?? 0) + v.count;
      }

      const botStats = Object.entries(byBot)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([botType, { total, pathCounts }]) => ({
          botType,
          total,
          topPaths: Object.entries(pathCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([p]) => p),
        }));

      const content = await generateBotInsight(site.domain, botStats);
      const now = new Date();

      await prisma.botInsight.upsert({
        where: { siteId: site.id },
        create: { siteId: site.id, content, generatedAt: now },
        update: { content, generatedAt: now },
      });

      console.info("[cron:bot-insights] Done — %s (%s)", site.id, site.domain);
      results.push({ siteId: site.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        "[cron:bot-insights] Failed — %s (%s): %s",
        site.id,
        site.domain,
        message,
      );
      captureException(error, { extra: { siteId: site.id } });
      results.push({ siteId: site.id, ok: false, error: message });
    }
  }

  return Response.json({ ok: true, results });
}
```

**Step 4: Generate React Router types for the new route**

```bash
pnpm react-router typegen
```

Expected: creates `.react-router/types/app/routes/+types/cron.bot-insights.ts`

**Step 5: Add the cron schedule to Vercel config**

Edit `.vercel/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/cron/bot-insights",
      "schedule": "0 12 * * *"
    }
  ],
  "github": {
    "enabled": false
  },
  "public": false
}
```

**Step 6: Run tests to verify they pass**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/cronBotInsights.test.ts
```

Expected: 6 tests PASS.

**Step 7: Commit**

```bash
git add app/routes/cron.bot-insights.ts test/routes/cronBotInsights.test.ts .vercel/vercel.json
git commit -m "feat: add bot insights cron route"
```

---

### Task 4: Display insight on the bots page

**Files:**
- Modify: `app/routes/site.$id_.bots/route.tsx`
- Modify: `test/routes/siteBots.test.ts`

**Context:** The bots page is at `app/routes/site.$id_.bots/route.tsx`. The loader already queries `BotVisit` rows. Add one more query for `BotInsight`. The component receives `insight` from loader data; if `null`, nothing is shown (no empty state). The existing HTML/screenshot baselines (`site-bots` and `site-bots-empty`) are not affected because neither seeds a `BotInsight` row, so the existing tests pass unchanged.

The insight card uses the neobrutalist style already established on this page (see the empty state card for reference: `rounded-base border-2 border-black bg-secondary-background p-12 shadow-shadow`). Use `bg-[hsl(47,100%,95%)]` for the insight card to distinguish it from data cards.

**Step 1: Write the failing test**

Open `test/routes/siteBots.test.ts`. After the closing `});` of the `describe("with bot visits", ...)` block (after line 210), add a new describe block:

```ts
describe("with bot insight", () => {
  let page: Awaited<ReturnType<typeof goto>>;

  beforeAll(async () => {
    await prisma.botInsight.create({
      data: {
        siteId,
        content: "ChatGPT visited 8 times this week, mostly your homepage.",
        generatedAt: new Date("2026-02-26T12:00:00Z"),
      },
    });
    page = await goto(`/site/${siteId}/bots?from=2026-01-27&until=2026-02-26`);
  });

  it("shows the insight text", async () => {
    await expect(
      page.getByText(
        "ChatGPT visited 8 times this week, mostly your homepage.",
      ),
    ).toBeVisible();
  });

  it("shows the Updated label", async () => {
    await expect(page.getByText(/Updated/)).toBeVisible();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/siteBots.test.ts
```

Expected: the two new tests FAIL — the insight text is not found on the page.

**Step 3: Add insight to the loader**

In `app/routes/site.$id_.bots/route.tsx`, add one query at the end of the loader function (after the `mimeTypes` computation, before `return`):

```ts
const insight = await prisma.botInsight.findUnique({
  where: { siteId: site.id },
});
```

Add `insight` to the return object:

```ts
return {
  site,
  insight,
  chartData,
  topBots,
  botActivity,
  topPaths,
  mimeTypes,
  totalVisits,
  uniqueBots,
  period,
};
```

**Step 4: Destructure insight in the component**

In `SiteBotsPage`, add `insight` to the destructured `loaderData`:

```ts
const {
  site,
  insight,
  chartData,
  topBots,
  botActivity,
  topPaths,
  mimeTypes,
  totalVisits,
  uniqueBots,
  period,
} = loaderData;
```

**Step 5: Render the insight card**

In the component, after the `SitePageHeader` and before the `{isEmpty ? ...}` block, add:

```tsx
{insight && (
  <div className="rounded-base border-2 border-black bg-[hsl(47,100%,95%)] p-6 shadow-shadow">
    <p className="font-medium leading-relaxed">{insight.content}</p>
    <p className="mt-2 text-foreground/50 text-xs">
      Updated {fmt.format(insight.generatedAt)}
    </p>
  </div>
)}
```

The `fmt` formatter is already defined in this file:
```ts
const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
```

**Step 6: Run tests to verify they pass**

```bash
pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/siteBots.test.ts
```

Expected: all tests PASS including the two new insight tests. The existing HTML/screenshot baselines should also pass because the earlier `with bot visits` describe does not seed a `BotInsight`, so the insight card is not rendered.

**Step 7: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: no errors.

**Step 8: Commit**

```bash
git add app/routes/site.\$id_.bots/route.tsx test/routes/siteBots.test.ts
git commit -m "feat: display bot insights on bots page"
```
