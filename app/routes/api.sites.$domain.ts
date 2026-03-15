import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);

  const site = await prisma.site.findFirst({
    where: {
      domain: params.domain,
      OR: [
        { ownerId: authUser.id },
        { siteUsers: { some: { userId: authUser.id } } },
      ],
    },
    select: {
      domain: true,
      createdAt: true,
      ownerId: true,
      owner: { select: { id: true, email: true } },
      siteUsers: {
        select: { user: { select: { id: true, email: true } } },
      },
    },
  });

  if (!site) return Response.json({ error: "Not found" }, { status: 404 });

  const users = [
    { ...site.owner, role: "owner" as const },
    ...site.siteUsers.map(({ user }) => ({ ...user, role: "member" as const })),
  ];

  return Response.json({ domain: site.domain, createdAt: site.createdAt, users });
}
