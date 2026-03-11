import { ArrowRightIcon } from "lucide-react";
import { Link, type useFetcher } from "react-router";
import { ActiveLink } from "~/components/ui/ActiveLink";
import type { Site } from "~/prisma";
import DeleteSiteDialog from "./DeleteSiteDialog";
import type { action } from "./route";

export default function SiteEntry({
  citationsToDmain,
  fetcher,
  score,
  site,
  totalBotVisits,
  uniqueBots,
}: {
  citationsToDmain: number;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  score: number;
  site: Site;
  totalBotVisits: number;
  uniqueBots: number;
}) {
  const isSubmitting = fetcher.state === "submitting";

  return (
    <div
      className={
        "block py-4 first:pt-0 last:pb-0" // preserve space-y-4 effect; optional
      }
      key={site.id}
    >
      <p className="flex flex-row items-center justify-between">
        <Link
          to={`/site/${site.id}/citations`}
          className="w-full font-bold font-mono text-lg"
        >
          {site.domain}
        </Link>
        <ActiveLink
          variant="button"
          to={`/site/${site.id}/citations`}
          aria-label="View site"
        >
          View Site <ArrowRightIcon className="size-4" />
        </ActiveLink>
      </p>
      <Link
        to={`/site/${site.id}/citations`}
        className="mt-4 grid grid-cols-4 gap-4 text-center"
      >
        <div>
          <p className="font-light">Citations</p>
          <p className="font-bold text-3xl">
            {citationsToDmain.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="font-light">Score</p>
          <p className="font-bold text-3xl">
            {score.toFixed(1).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="font-light">Bot Visits</p>
          <p className="font-bold text-3xl">
            {totalBotVisits.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="font-light">Unique Bots</p>
          <p className="font-bold text-3xl">{uniqueBots.toLocaleString()}</p>
        </div>
      </Link>
      <div>
        <DeleteSiteDialog
          domain={site.domain}
          onConfirm={() => {
            fetcher.submit({ siteId: site.id }, { method: "DELETE" });
          }}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
