import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.me";

export async function loader({ request }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      ownedSites: {
        select: { domain: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const { ownedSites, ...rest } = user;
  return Response.json({ ...rest, sites: ownedSites });
}
