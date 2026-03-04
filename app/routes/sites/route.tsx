import { Temporal } from "@js-temporal/polyfill";
import { Link } from "react-router";
import { ActiveLink } from "~/components/ui/ActiveLink";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";
import { requireUser } from "~/lib/auth.server";
import calculateCitationMetrics from "~/lib/llm-visibility/calculateCitationMetrics";
import { getBotMetrics } from "~/lib/llm-visibility/getBotMetrics.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/route";
import SiteEntry from "./SiteEntry";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Your Sites | CiteUp" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const sites = await prisma.site.findMany({
    where: { accountId: user.accountId },
    orderBy: { createdAt: "desc" },
  });

  // Calculate metrics for each site
  const sitesWithMetrics = await Promise.all(
    sites.map(async (site) => {
      // Get citation metrics
      const gte = new Date(
        Temporal.Now.plainDateISO().subtract({ days: 14 }).toJSON(),
      );

      const citationRuns = await prisma.citationQueryRun.findMany({
        include: { queries: true },
        where: { siteId: site.id, createdAt: { gte } },
      });

      const allQueries = citationRuns.flatMap((run) => run.queries);
      const citationMetrics = calculateCitationMetrics(allQueries, site.domain);

      // Get bot metrics
      const botMetrics = await getBotMetrics(site.id, 14);

      return {
        site,
        totalCitations: citationMetrics.totalCitations,
        avgScore: citationMetrics.avgScore,
        totalBotVisits: botMetrics.totalBotVisits,
        uniqueBots: botMetrics.uniqueBots,
      };
    }),
  );

  return { sites: sitesWithMetrics };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "DELETE")
    throw new Response("Method not allowed", { status: 405 });

  const user = await requireUser(request);
  const formData = await request.formData();
  const siteId = formData.get("siteId")?.toString();

  // Verify site exists and belongs to user
  const site = await prisma.site.findFirst({
    where: { id: siteId, accountId: user.accountId },
  });
  if (!site) return { ok: false, error: "Site not found" };

  // Delete the site (cascades delete all related data)
  await prisma.site.delete({ where: { id: siteId } });
  return { ok: true };
}

export default function SitesPage({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;

  if (sites.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
        <h1 className="font-heading text-3xl">Your Sites</h1>
        <div className="rounded-base border-2 border-black bg-secondary-background p-8 text-center shadow-shadow">
          <p className="mb-2 font-bold text-xl">No sites yet</p>
          <p className="mb-6 text-base text-foreground/60">
            Add your first site to start tracking when AI platforms cite you.
          </p>
          <ActiveLink variant="button" to="/sites/new" bg="yellow">
            Add your first site
          </ActiveLink>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
      <div className="flex flex-row items-center justify-between gap-4">
        <h1 className="font-heading text-3xl">Your Sites</h1>
        <Button render={<Link to="/sites/new" />}>Add Site</Button>
      </div>

      <Card>
        <CardContent className="space-y-4 divide-y-2 divide-black/10">
          {sites.map((item) => (
            <SiteEntry
              key={item.site.id}
              site={item.site}
              totalCitations={item.totalCitations}
              avgScore={item.avgScore}
              totalBotVisits={item.totalBotVisits}
              uniqueBots={item.uniqueBots}
            />
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
