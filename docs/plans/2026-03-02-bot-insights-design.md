# Bot Insights Design

**Goal:** Generate a plain-English summary of the last 7 days of AI bot crawl activity for each site and surface it at the top of the /bots page.

**Architecture:** A daily cron job aggregates `BotVisit` rows for the prior 7 days, passes the summary to Claude haiku, and upserts a cached `BotInsight` row per site. The bots page loader fetches and displays the cached insight above the existing charts.

**Tech stack:** Prisma (PostgreSQL), `@ai-sdk/anthropic` haiku model via `generateText`, Vercel cron (noon UTC = 4am PST).

---

## Schema

New `BotInsight` model — one row per site, unique on `siteId`:

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

`Site` gets a `botInsight BotInsight?` back-relation. `content` is plain text returned by Claude, rendered as-is.

## Insight generation

`app/lib/llm-visibility/generateBotInsight.ts` — thin function, easy to test:

- **Input:** site domain, per-bot visit totals, top 5 paths per bot (pre-aggregated by caller)
- **Model:** haiku via `~/lib/llm-visibility/anthropic`
- **Prompt:** instructs Claude to write 3–5 plain-English sentences, one observation per notable bot (e.g. "GPTBot visited 47 times this week, mostly your /blog/* pages.")
- **Output:** raw text string

Aggregation happens in the cron handler, not in this function.

## Cron job

`app/routes/cron.bot-insights.ts` — same auth pattern as `cron.citation-runs.ts`:

- Bearer token check via `CRON_SECRET` env var
- Finds sites with at least one `BotVisit` where `date >= now - 24h`
- For each qualifying site: fetches last 7 days of `BotVisit` rows, aggregates in JS, calls `generateBotInsight`, upserts `BotInsight`
- Logs per-site success/failure with `[cron:bot-insights]` prefix
- Captures exceptions to Sentry, never throws — returns `{ ok: true, results }`

Vercel schedule: `"0 12 * * *"` (noon UTC = 4am PST / 5am PDT), added to `.vercel/vercel.json`.

## Display

`app/routes/site.$id_.bots/route.tsx`:

- Loader fetches `prisma.botInsight.findUnique({ where: { siteId: site.id } })` alongside existing queries
- If insight exists: renders a callout card above the stats grid with the `content` text and a subtle "Updated [date]" note
- If no insight: nothing shown — no empty state, existing page unchanged
- Date range selector still controls all charts/tables; the insight card always reflects the last 7 days (made clear by the "Updated" timestamp)
