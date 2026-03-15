import { requireAdminApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.admin.users";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminApiKey(request);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      ownedSites: {
        select: { domain: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    users: users.map(({ ownedSites, ...user }) => ({
      ...user,
      sites: ownedSites,
    })),
  });
}
