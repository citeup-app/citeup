import { verifySiteAccess } from "~/lib/apiAuth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain_.runs.$runId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

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

  if (!run) throw new Response("Not found", { status: 404 });
  return Response.json(run);
}
