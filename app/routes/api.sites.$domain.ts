import { verifySiteAccess } from "~/lib/apiAuth.server";
import type { Route } from "./+types/api.sites.$domain";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

  return Response.json({
    domain: site.domain,
    createdAt: site.createdAt,
    users: [
      {
        id: site.owner.id,
        email: site.owner.email,
        role: "owner" as const,
      },
      ...site.siteUsers.map(({ user }) => ({
        id: user.id,
        email: user.email,
        role: "member" as const,
      })),
    ],
  });
}
