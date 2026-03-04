import { Temporal } from "@js-temporal/polyfill";
import prisma from "~/lib/prisma.server";

export interface BotMetrics {
  totalBotVisits: number;
  uniqueBots: number;
}

export async function getBotMetrics(
  siteId: string,
  days = 14,
): Promise<BotMetrics> {
  const gte = new Date(Temporal.Now.plainDateISO().subtract({ days }).toJSON());

  // Get total bot visits
  const visitResult = await prisma.botVisit.aggregate({
    _sum: { count: true },
    where: { siteId, date: { gte } },
  });

  // Get unique bot types
  const uniqueBotsResult = await prisma.botVisit.groupBy({
    by: ["botType"],
    where: { siteId, date: { gte } },
  });

  return {
    totalBotVisits: visitResult._sum.count || 0,
    uniqueBots: uniqueBotsResult.length,
  };
}
