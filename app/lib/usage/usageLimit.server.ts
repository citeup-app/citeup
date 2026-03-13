import prisma from "~/lib/prisma.server";
import { Prisma } from "~/prisma";
import { ACCOUNT_LIMITS, calculateCostUsd } from "./costConfig";
import { UsageLimitExceededError } from "./UsageLimitExceededError";

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
    calculateCostUsd(model, inputTokens, outputTokens),
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
  ] as { timeWindow: keyof typeof ACCOUNT_LIMITS; since: Date }[];

  await Promise.all(
    timeWindows.map(async ({ timeWindow, since }) => {
      const { _sum } = await prisma.usageEvent.aggregate({
        where: { siteId, createdAt: { gte: since } },
        _sum: { cost: true },
      });

      const totalCost = Number(_sum.cost ?? 0);
      const limits = ACCOUNT_LIMITS[timeWindow];

      if (totalCost > limits.costUsd)
        throw new UsageLimitExceededError({
          current: totalCost,
          limit: limits.costUsd,
          timeWindow: timeWindow,
        });
    }),
  );
}
