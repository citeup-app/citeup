# API Usage Limiting — Design

## Problem

Every AI platform query has a cost (per token or per request). Without limits, a single account can exhaust budget unbounded. We need hourly, daily, and monthly caps per account on both cost (USD) and request count, checked before each API call and enforced via a typed exception so callers can handle the error appropriately.

## Scope

- Aggregate limits across all platforms (Claude, OpenAI, Gemini, Perplexity) per account
- Both cost-based (USD) and request-count-based limits
- Three time windows: last 60 minutes, last 24 hours, last 30 days
- Limits defined in a config file (same for all accounts)
- DB-only (no Redis); three indexed aggregate queries per pre-check
- Typed exception so route actions can return user-facing errors and the cron job can skip gracefully

## Data Model

Add `UsageEvent` to the Prisma schema:

```prisma
model UsageEvent {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now()) @map("created_at")
  accountId    String   @map("account_id")
  platform     String   // "claude" | "chatgpt" | "gemini" | "perplexity"
  model        String
  inputTokens  Int      @default(0) @map("input_tokens")
  outputTokens Int      @default(0) @map("output_tokens")
  requests     Int      @default(1) @map("requests")
  costUsd      Decimal  @db.Decimal(10, 6) @map("cost_usd")
  account      Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, createdAt])
  @@map("usage_events")
}
```

The compound index on `(accountId, createdAt)` makes window aggregate queries fast.

## Cost Config

File: `app/lib/usage/costConfig.ts`

Keyed by model ID so it stays accurate when models change. For future per-request APIs, add a `perRequest` field.

```ts
export const PLATFORM_COSTS = {
  "claude-haiku-4-5-20251001": { inputPerM: 1.00,  outputPerM: 5.00  },
  "gpt-5-chat-latest":         { inputPerM: 1.25,  outputPerM: 10.00 },
  "gemini-2.5-flash":          { inputPerM: 0.30,  outputPerM: 2.50  },
  "sonar":                     { inputPerM: 1.00,  outputPerM: 1.00  },
} satisfies Record<string, { inputPerM: number; outputPerM: number }>

export const ACCOUNT_LIMITS = {
  hourly:  { costUsd: 2.00,   requests: 500   },
  daily:   { costUsd: 20.00,  requests: 5000  },
  monthly: { costUsd: 100.00, requests: 50000 },
}
```

## Typed Exception

```ts
export class UsageLimitExceededError extends Error {
  constructor(
    public readonly window: "hourly" | "daily" | "monthly",
    public readonly limitType: "cost" | "requests",
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`${window} ${limitType} limit exceeded: ${current} / ${limit}`);
    this.name = "UsageLimitExceededError";
  }
}
```

## Core Functions

File: `app/lib/usage/usageLimit.server.ts`

### `checkUsageLimits(accountId: string): Promise<void>`

Runs three `SELECT SUM(cost_usd), SUM(requests)` queries against `usage_events` filtered by `accountId` and `createdAt > now() - interval`. Checks cost first, then request count. Throws `UsageLimitExceededError` on the first violation.

### `recordUsageEvent(args: RecordUsageEventArgs): Promise<void>`

Computes `costUsd = (inputTokens / 1_000_000 * inputPerM) + (outputTokens / 1_000_000 * outputPerM)` using `PLATFORM_COSTS[model]`, then inserts one `UsageEvent` row.

## Integration

In each platform client (`claudeClient.ts`, `openaiClient.ts`, etc.):

```ts
await checkUsageLimits(accountId);
const result = await generateText(...);
await recordUsageEvent({ accountId, platform, model, ...result.usage });
```

The Vercel AI SDK's `generateText()` already returns `result.usage` with `promptTokens` and `completionTokens`.

## Error Handling

**Route actions (user-triggered):** catch `UsageLimitExceededError` and return `{ ok: false, error: "..." }` with a human-readable message based on `error.window` and `error.limitType`.

**Cron job:** catch `UsageLimitExceededError` per site and skip gracefully (log and continue to next site).
