import { verifySiteAccess } from "~/lib/apiAuth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain_.runs";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : undefined;

  const runs = await prisma.citationQueryRun.findMany({
    where: {
      siteId: site.id,
      ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
    },
    select: {
      id: true,
      platform: true,
      model: true,
      createdAt: true,
      queries: { select: { citations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    runs: runs.map(({ queries, ...run }) => ({
      ...run,
      queryCount: queries.length,
      citationCount: queries.reduce((sum, q) => sum + q.citations.length, 0),
    })),
  });
}
