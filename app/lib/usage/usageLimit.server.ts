import prisma from "~/lib/prisma.server";
import { Prisma } from "~/prisma";
import { ACCOUNT_LIMITS, calculateCostUsd } from "./costConfig";
import { UsageLimitExceededError } from "./UsageLimitExceededError";

/**
 * Record a usage event for a given account, model, and input/output tokens.
 *
 * @param accountId - The ID of the account to record the usage event for.
 * @param model - The model used to generate the usage event.
 * @param inputTokens - The number of input tokens used to generate the usage event.
 * @param outputTokens - The number of output tokens used to generate the usage event.
 */
export async function recordUsageEvent({
  accountId,
  model,
  inputTokens,
  outputTokens,
}: {
  accountId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const cost = new Prisma.Decimal(
    calculateCostUsd(model, inputTokens, outputTokens),
  );
  await prisma.usageEvent.create({
    data: { accountId, cost, inputTokens, model, outputTokens },
  });
}

/**
 * Check the usage limits for a given account.
 *
 * @param accountId - The ID of the account to check the usage limits for.
 * @throws {UsageLimitExceededError} - If the usage limits are exceeded.
 */
export async function checkUsageLimits(accountId: string): Promise<void> {
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
        where: { accountId, createdAt: { gte: since } },
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
