# API Usage Limiting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Check and record API usage (cost + request count) per account before and after every AI platform call, throwing a typed `UsageLimitExceededError` when hourly/daily/monthly limits are exceeded.

**Architecture:** Append-only `UsageEvent` table in Postgres; three indexed aggregate queries before each API call; cost computed from per-model pricing config; `accountId` threaded from `queryAccount` → `queryPlatform` → `singleQueryRepetition`.

**Tech Stack:** Prisma, PostgreSQL, Vercel AI SDK (`generateText` returns `result.usage`), TypeScript

---

### Task 1: Add UsageEvent to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add UsageEvent model and Account relation**

In `prisma/schema.prisma`, add the `usageEvents` relation to the `Account` model and append the new model:

```prisma
// In model Account, add:
usageEvents UsageEvent[]
```

```prisma
model UsageEvent {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now()) @map("created_at")
  accountId    String   @map("account_id")
  platform     String
  model        String
  inputTokens  Int      @default(0) @map("input_tokens")
  outputTokens Int      @default(0) @map("output_tokens")
  requests     Int      @default(1)
  costUsd      Decimal  @db.Decimal(10, 6) @map("cost_usd")
  account      Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, createdAt])
  @@map("usage_events")
}
```

**Step 2: Push schema and regenerate client**

```bash
pnpm prisma db push && pnpm prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.`

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add UsageEvent schema for API usage tracking"
```

---

### Task 2: Cost config and typed error class

**Files:**
- Create: `app/lib/usage/costConfig.ts`
- Create: `app/lib/usage/UsageLimitExceededError.ts`

**Step 1: Create cost config**

```ts
// app/lib/usage/costConfig.ts

export type TokenCost = { inputPerM: number; outputPerM: number };
export type RequestCost = { perRequest: number };
export type PlatformCost = TokenCost | RequestCost;

export function isTokenCost(cost: PlatformCost): cost is TokenCost {
  return "inputPerM" in cost;
}

// Keyed by exact model ID string used in generateText calls.
// Add new models here when platform clients are updated.
export const PLATFORM_COSTS: Record<string, PlatformCost> = {
  "claude-haiku-4-5-20251001": { inputPerM: 1.00, outputPerM: 5.00 },
  "gpt-5-chat-latest":         { inputPerM: 1.25, outputPerM: 10.00 },
  "gemini-2.5-flash":          { inputPerM: 0.30, outputPerM: 2.50 },
  "sonar":                     { inputPerM: 1.00, outputPerM: 1.00 },
};

// Aggregate limits per account across all platforms.
export const ACCOUNT_LIMITS = {
  hourly:  { costUsd: 2.00,   requests: 500   },
  daily:   { costUsd: 20.00,  requests: 5000  },
  monthly: { costUsd: 100.00, requests: 50000 },
} as const;

export type LimitWindow = keyof typeof ACCOUNT_LIMITS;
export type LimitType = "cost" | "requests";
```

**Step 2: Create typed error class**

```ts
// app/lib/usage/UsageLimitExceededError.ts

import type { LimitType, LimitWindow } from "./costConfig";

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly window: LimitWindow,
    public readonly limitType: LimitType,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`${window} ${limitType} limit exceeded: ${current} / ${limit}`);
    this.name = "UsageLimitExceededError";
  }
}
```

**Step 3: Commit**

```bash
git add app/lib/usage/costConfig.ts app/lib/usage/UsageLimitExceededError.ts
git commit -m "feat: add usage cost config and UsageLimitExceededError"
```

---

### Task 3: checkUsageLimits and recordUsageEvent

**Files:**
- Create: `app/lib/usage/usageLimit.server.ts`
- Create: `test/lib/usageLimit.test.ts`

**Step 1: Write failing tests**

```ts
// test/lib/usageLimit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import prisma from "~/lib/prisma.server";
import { checkUsageLimits, recordUsageEvent } from "~/lib/usage/usageLimit.server";
import { UsageLimitExceededError } from "~/lib/usage/UsageLimitExceededError";

const ACCOUNT_ID = "test-usage-account-1";

beforeEach(async () => {
  await prisma.usageEvent.deleteMany({ where: { accountId: ACCOUNT_ID } });
  // Ensure account exists
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    create: { id: ACCOUNT_ID },
    update: {},
  });
});

describe("recordUsageEvent", () => {
  it("inserts a UsageEvent row with computed cost", async () => {
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      platform: "claude",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const events = await prisma.usageEvent.findMany({ where: { accountId: ACCOUNT_ID } });
    expect(events).toHaveLength(1);
    // $1.00 input + $5.00 output = $6.00
    expect(Number(events[0].costUsd)).toBeCloseTo(6.0);
    expect(events[0].inputTokens).toBe(1_000_000);
    expect(events[0].outputTokens).toBe(1_000_000);
    expect(events[0].requests).toBe(1);
  });
});

describe("checkUsageLimits", () => {
  it("passes when no events exist", async () => {
    await expect(checkUsageLimits(ACCOUNT_ID)).resolves.toBeUndefined();
  });

  it("throws UsageLimitExceededError when hourly cost is exceeded", async () => {
    // Insert enough events to exceed $2.00/hour limit
    // claude-haiku: $1/M input + $5/M output; 500k output = $2.50 > $2 limit
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      platform: "claude",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 500_000,
    });

    await expect(checkUsageLimits(ACCOUNT_ID)).rejects.toThrow(UsageLimitExceededError);
  });

  it("throws with correct window and limitType", async () => {
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      platform: "claude",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 500_000,
    });

    try {
      await checkUsageLimits(ACCOUNT_ID);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UsageLimitExceededError);
      const e = err as UsageLimitExceededError;
      expect(e.window).toBe("hourly");
      expect(e.limitType).toBe("cost");
      expect(e.current).toBeGreaterThan(2.0);
      expect(e.limit).toBe(2.0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/lib/usageLimit.test.ts
```

Expected: FAIL with `Cannot find module '~/lib/usage/usageLimit.server'`

**Step 3: Implement usageLimit.server.ts**

```ts
// app/lib/usage/usageLimit.server.ts
import { Decimal } from "@prisma/client/runtime/library";
import prisma from "~/lib/prisma.server";
import {
  ACCOUNT_LIMITS,
  PLATFORM_COSTS,
  isTokenCost,
  type LimitWindow,
} from "./costConfig";
import { UsageLimitExceededError } from "./UsageLimitExceededError";

export type RecordUsageEventArgs = {
  accountId: string;
  platform: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function recordUsageEvent({
  accountId,
  platform,
  model,
  inputTokens,
  outputTokens,
}: RecordUsageEventArgs): Promise<void> {
  const cost = PLATFORM_COSTS[model];
  let costUsd = 0;
  if (cost && isTokenCost(cost))
    costUsd = (inputTokens / 1_000_000) * cost.inputPerM + (outputTokens / 1_000_000) * cost.outputPerM;
  else if (cost)
    costUsd = cost.perRequest;

  await prisma.usageEvent.create({
    data: {
      accountId,
      platform,
      model,
      inputTokens,
      outputTokens,
      requests: 1,
      costUsd: new Decimal(costUsd),
    },
  });
}

export async function checkUsageLimits(accountId: string): Promise<void> {
  const now = new Date();
  const windows: { window: LimitWindow; since: Date }[] = [
    { window: "hourly",  since: new Date(now.getTime() - 60 * 60 * 1000) },
    { window: "daily",   since: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    { window: "monthly", since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
  ];

  for (const { window, since } of windows) {
    const agg = await prisma.usageEvent.aggregate({
      where: { accountId, createdAt: { gte: since } },
      _sum: { costUsd: true, requests: true },
    });

    const totalCost = Number(agg._sum.costUsd ?? 0);
    const totalRequests = Number(agg._sum.requests ?? 0);
    const limits = ACCOUNT_LIMITS[window];

    if (totalCost > limits.costUsd)
      throw new UsageLimitExceededError(window, "cost", totalCost, limits.costUsd);
    if (totalRequests > limits.requests)
      throw new UsageLimitExceededError(window, "requests", totalRequests, limits.requests);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm vitest run test/lib/usageLimit.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add app/lib/usage/usageLimit.server.ts test/lib/usageLimit.test.ts
git commit -m "feat: add checkUsageLimits and recordUsageEvent"
```

---

### Task 4: Update QueryFn type and platform clients to return usage

The Vercel AI SDK's `generateText` returns `result.usage` with `promptTokens` and `completionTokens`. We need to surface this through `QueryFn` so `singleQueryRepetition` can record it.

**Files:**
- Modify: `app/lib/llm-visibility/llmVisibility.ts`
- Modify: `app/lib/llm-visibility/claudeClient.ts`
- Modify: `app/lib/llm-visibility/openaiClient.ts`
- Modify: `app/lib/llm-visibility/geminiClient.ts`
- Modify: `app/lib/llm-visibility/perplexityClient.ts`

**Step 1: Add `usage` to QueryFn return type**

In `app/lib/llm-visibility/llmVisibility.ts`, update the return type:

```ts
export type QueryFn = (query: string) => Promise<{
  citations: string[];
  extraQueries: string[];
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}>;
```

**Step 2: Update claudeClient.ts**

Change `const { sources, text }` to `const { sources, text, usage }` and include it in the return:

```ts
const { sources, text, usage } = await generateText({ ... });
// ...
return { citations, extraQueries: [], text, usage };
```

**Step 3: Update openaiClient.ts**

Same pattern:

```ts
const { sources, text, usage } = await generateText({ ... });
// ...
return { citations, extraQueries: [], text, usage };
```

**Step 4: Update geminiClient.ts**

Same pattern. Read the file first to see its structure, then add `usage` to destructure and return.

**Step 5: Update perplexityClient.ts**

Same pattern.

**Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors. TypeScript will catch any client that forgot to return `usage`.

**Step 7: Commit**

```bash
git add app/lib/llm-visibility/llmVisibility.ts \
        app/lib/llm-visibility/claudeClient.ts \
        app/lib/llm-visibility/openaiClient.ts \
        app/lib/llm-visibility/geminiClient.ts \
        app/lib/llm-visibility/perplexityClient.ts
git commit -m "feat: return usage tokens from all platform clients"
```

---

### Task 5: Thread accountId into queryPlatform and wire usage checks

`queryAccount` already has access to `site.accountId`. Thread it into `queryPlatform` and down to `singleQueryRepetition`, where we call `checkUsageLimits` before and `recordUsageEvent` after each API call.

**Files:**
- Modify: `app/lib/llm-visibility/queryPlatform.ts`
- Modify: `app/lib/llm-visibility/queryAccount.ts`

**Step 1: Update queryPlatform signature and pass accountId to singleQueryRepetition**

In `queryPlatform.ts`, add `accountId: string` to the outer function params:

```ts
export default async function queryPlatform({
  accountId,   // <-- add this
  modelId,
  newerThan,
  platform,
  queries,
  queryFn,
  repetitions,
  site,
}: {
  accountId: string;  // <-- add this
  // ... rest unchanged
})
```

Pass it through to `singleQueryRepetition` in the loop:

```ts
await singleQueryRepetition({
  accountId,   // <-- add
  group: query.group,
  modelId,     // <-- add (needed for recordUsageEvent)
  platform,
  query: query.query,
  queryFn,
  repetition,
  runId: run.id,
  site,
});
```

**Step 2: Update singleQueryRepetition to check and record usage**

Add `accountId` and `modelId` to `singleQueryRepetition` params, then wire in the usage calls:

```ts
import { checkUsageLimits, recordUsageEvent } from "~/lib/usage/usageLimit.server";

async function singleQueryRepetition({
  accountId,   // <-- add
  group,
  modelId,     // <-- add
  platform,
  query,
  queryFn,
  repetition,
  runId,
  site,
}: {
  accountId: string;  // <-- add
  modelId: string;    // <-- add
  // ... rest unchanged
}): Promise<void> {
  // ... existing dedup check unchanged ...

  try {
    await checkUsageLimits(accountId);  // <-- add before API call
    const { citations, extraQueries, text, usage } = await queryFn(query);
    await recordUsageEvent({            // <-- add after API call
      accountId,
      platform,
      model: modelId,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    });
    // ... rest unchanged (logging, prisma.citationQuery.create) ...
  } catch (error) {
    // ... existing catch unchanged ...
  }
}
```

**Step 3: Update queryAccount.ts to pass accountId**

In `queryAccount.ts`, `site.accountId` is already available. Add `accountId: site.accountId` to each `queryPlatform` / `runPlatform` call:

```ts
await Promise.all([
  queryPlatform({
    accountId: site.accountId,  // <-- add
    modelId: "gpt-5-chat-latest",
    // ...
  }),
  queryPlatform({
    accountId: site.accountId,  // <-- add
    modelId: "sonar",
    // ...
  }),
  runPlatform({
    accountId: site.accountId,  // <-- add
    modelId: "claude-haiku-4-5-20251001",
    // ...
  }),
  runPlatform({
    accountId: site.accountId,  // <-- add
    modelId: "gemini-2.5-flash",
    // ...
  }),
]);
```

**Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

**Step 5: Commit**

```bash
git add app/lib/llm-visibility/queryPlatform.ts app/lib/llm-visibility/queryAccount.ts
git commit -m "feat: wire usage checks and recording into queryPlatform"
```

---

### Task 6: Handle UsageLimitExceededError in the cron job

The cron job's `catch` block currently calls `captureException` for all errors. `UsageLimitExceededError` is expected and should not go to Sentry — just log it and continue.

**Files:**
- Modify: `app/routes/cron.citation-runs.ts`

**Step 1: Update the cron catch block**

```ts
import { UsageLimitExceededError } from "~/lib/usage/UsageLimitExceededError";

// In the for loop catch:
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger(
    "[cron:citation-runs] Failed — %s (%s): %s",
    site.id,
    site.domain,
    message,
  );
  if (!(error instanceof UsageLimitExceededError))
    captureException(error, { extra: { siteId: site.id } });
  results.push({ siteId: site.id, ok: false, error: message });
}
```

**Step 2: Run typecheck and full check**

```bash
pnpm typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add app/routes/cron.citation-runs.ts
git commit -m "feat: skip Sentry capture for UsageLimitExceededError in cron"
```

---

### Task 7: Final verification

**Step 1: Run all tests**

```bash
pnpm run check && pnpm vitest run
```

Expected: All pass.

**Step 2: Run the new usage tests specifically**

```bash
pnpm vitest run test/lib/usageLimit.test.ts
```

Expected: All pass.
