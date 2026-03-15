import { invariant } from "es-toolkit";
import prisma from "~/lib/prisma.server";
import { Prisma } from "~/prisma";
import { UsageLimitExceededError } from "./UsageLimitExceededError";

// Aggregate limits per account across all models.
const accountLimits = {
  hourly: { costUSD: 2.0, requests: 500 },
  daily: { costUSD: 5.0, requests: 1000 },
  monthly: { costUSD: 20.0, requests: 5000 },
} as const;

// Keyed by exact model ID string used in generateText calls.
// Add new models here when model pricing is updated.
const modelPricing: Record<
  string,
  {
    costPerInputM: number;
    costPerOutputM: number;
    perRequest?: number;
  }
> = {
  "claude-haiku-4-5-20251001": { costPerInputM: 1.0, costPerOutputM: 5.0 },
  "gpt-5-chat-latest": { costPerInputM: 1.25, costPerOutputM: 10.0 },
  "gemini-2.5-flash": { costPerInputM: 0.3, costPerOutputM: 2.5 },
  sonar: { costPerInputM: 1.0, costPerOutputM: 1.0 },
};

export async function recordUsageEvent({
  siteId,
  model,
  inputTokens,
  outputTokens,
}: {
  siteId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const cost = new Prisma.Decimal(
    calculateCostUSD(model, inputTokens, outputTokens),
  );
  await prisma.usageEvent.create({
    data: { siteId, cost, inputTokens, model, outputTokens },
  });
}

export async function checkUsageLimits(siteId: string): Promise<void> {
  const now = new Date();
  const timeWindows = [
    { timeWindow: "hourly", since: new Date(now.getTime() - 60 * 60 * 1000) },
    {
      timeWindow: "daily",
      since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
    {
      timeWindow: "monthly",
      since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    },
  ] as { timeWindow: keyof typeof accountLimits; since: Date }[];

  await Promise.all(
    timeWindows.map(async ({ timeWindow, since }) => {
      const { _sum } = await prisma.usageEvent.aggregate({
        where: { siteId, createdAt: { gte: since } },
        _sum: { cost: true },
      });

      const totalCost = Number(_sum.cost ?? 0);
      const limits = accountLimits[timeWindow];

      if (totalCost > limits.costUSD)
        throw new UsageLimitExceededError({
          current: totalCost,
          limit: limits.costUSD,
          timeWindow: timeWindow,
        });
    }),
  );
}

function calculateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost = modelPricing[model];
  invariant(cost, `Unknown model: ${model}`);
  return "perRequest" in cost
    ? Number(cost.perRequest)
    : (inputTokens / 1_000_000) * cost.costPerInputM +
        (outputTokens / 1_000_000) * cost.costPerOutputM;
}
