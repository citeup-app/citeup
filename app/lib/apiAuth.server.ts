import prisma from "~/lib/prisma.server";
import envVars from "./envVars";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireAdminApiKey(request: Request): Promise<void> {
  const auth = request.headers.get("authorization");
  if (!auth) throw new Response("Unauthorized", { status: 401 });
  const [tokenType, token] = auth.split(/\s+/);
  if (tokenType !== "Bearer")
    throw new Response("Unauthorized", { status: 401 });
  if (token !== envVars.ADMIN_API_SECRET)
    throw new Response("Unauthorized", { status: 401 });
}

export async function verifySiteAccess({
  domain,
  request,
}: {
  domain: string;
  request: Request;
}): Promise<{
  id: string;
  domain: string;
  createdAt: Date;
  ownerId: string;
  owner: { id: string; email: string };
  siteUsers: { user: { id: string; email: string } }[];
}> {
  const site = await prisma.site.findFirst({
    where: { domain },
    select: {
      id: true,
      domain: true,
      createdAt: true,
      ownerId: true,
      owner: { select: { id: true, email: true, apiKey: true } },
      siteUsers: {
        select: { user: { select: { id: true, email: true, apiKey: true } } },
      },
    },
  });
  if (!site) throw new Response("Not found", { status: 404 });

  const auth = request.headers.get("authorization");
  if (!auth) throw new Response("Unauthorized", { status: 401 });
  const [tokenType, token] = auth.split(/\s+/);
  if (tokenType !== "Bearer")
    throw new Response("Unauthorized", { status: 401 });

  const tokenMatch =
    site.owner.apiKey === token ||
    site.siteUsers.some(({ user }) => user.apiKey === token);
  if (!tokenMatch) throw new Response("Forbidden", { status: 403 });

  return site;
}
