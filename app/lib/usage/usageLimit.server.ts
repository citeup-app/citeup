import { invariant } from "es-toolkit";
import { Prisma } from "~/prisma";
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
  invariant(cost, `Unknown model: ${model}`);
  let costUsd = 0;
  if (isTokenCost(cost))
    costUsd = (inputTokens / 1_000_000) * cost.inputPerM + (outputTokens / 1_000_000) * cost.outputPerM;
  else
    costUsd = cost.perRequest;

  await prisma.usageEvent.create({
    data: {
      accountId,
      platform,
      model,
      inputTokens,
      outputTokens,
      requests: 1,
      costUsd: new Prisma.Decimal(costUsd),
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
