import { Link } from "react-router";
import { Temporal } from "@js-temporal/polyfill";
import { ActiveLink } from "~/components/ui/ActiveLink";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardContent,
} from "~/components/ui/Card";
import calculateCitationMetrics from "~/lib/llm-visibility/calculateCitationMetrics";
import { getBotMetrics } from "~/lib/llm-visibility/getBotMetrics.server";
import { requireUser } from "~/lib/auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/route";
import type { Site } from "~/prisma";

export interface SiteWithMetrics {
  site: Site;
  totalCitations: number;
  avgScore: number;
  totalBotVisits: number;
  uniqueBots: number;
}

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
  const sitesWithMetrics: SiteWithMetrics[] = await Promise.all(
    sites.map(async (site) => {
      // Get citation metrics
      const now = Temporal.Now.plainDateISO();
      const from = now.subtract({ days: 14 });

      const citationRuns = await prisma.citationQueryRun.findMany({
        include: { queries: true },
        where: {
          siteId: site.id,
          createdAt: {
            gte: from.toString(),
          },
        },
      });

      const allQueries = citationRuns.flatMap((run) => run.queries);
      const citationMetrics = calculateCitationMetrics(
        allQueries,
        site.domain,
      );

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
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black">
                <th className="px-4 py-2 text-left font-bold">Domain</th>
                <th className="px-4 py-2 text-right font-bold">Citations</th>
                <th className="px-4 py-2 text-right font-bold">Avg Score</th>
                <th className="px-4 py-2 text-right font-bold">Bot Visits</th>
                <th className="px-4 py-2 text-right font-bold">Unique Bots</th>
                <th className="px-4 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((item, idx) => (
                <tr
                  key={item.site.id}
                  className={idx < sites.length - 1 ? "border-b border-gray-200" : ""}
                >
                  <td className="px-4 py-2">
                    <span className="font-medium">{item.site.domain}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.totalCitations}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.avgScore.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.totalBotVisits}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.uniqueBots}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex gap-2 justify-end">
                      <ActiveLink
                        size="sm"
                        to={`/site/${item.site.id}/citations`}
                        variant="button"
                      >
                        View
                      </ActiveLink>
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => {
                          // Will implement delete in Task 5
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}
