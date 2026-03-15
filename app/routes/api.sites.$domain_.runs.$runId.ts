import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import { requireSiteAccess } from "~/lib/sites.server";
import type { Route } from "./+types/api.sites.$domain_.runs.$runId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);
  const site = await requireSiteAccess(params.domain, authUser.id);

  const run = await prisma.citationQueryRun.findFirst({
    where: { id: params.runId, siteId: site.id },
    select: {
      id: true,
      platform: true,
      model: true,
      createdAt: true,
      queries: {
        select: {
          id: true,
          query: true,
          group: true,
          position: true,
          citations: true,
        },
        orderBy: { query: "asc" },
      },
    },
  });

  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(run);
}
