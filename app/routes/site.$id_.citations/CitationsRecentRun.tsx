import { groupBy, mean } from "es-toolkit";
import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/Table";
import type { Prisma } from "~/prisma";

export default function RecentVisibility({
  run,
  site,
}: {
  run: Prisma.CitationQueryRunGetPayload<{ include: { queries: true } }>;
  site: { id: string; domain: string };
}) {
  const grouped = groupBy(run.queries, (q) => q.query);

  const aggregates = Object.entries(grouped).map(([query, repeats]) => ({
    id: repeats[0].id,
    query,
    group: repeats[0].group,
    citations: repeats.flatMap((q) => q.citations),
    positions: repeats.flatMap((q) => (q.position ? q.position + 1 : null)),
    text: repeats[0].text,
    score: mean(
      repeats.map((q) =>
        q.position === null ? 0 : q.position === 0 ? 50 : 10,
      ),
    ),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Recent Run</CardTitle>
        <CardDescription>
          {run.model} · {run.queries.length} checks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold text-foreground">Group</TableHead>
              <TableHead className="font-bold text-foreground">Query</TableHead>
              <TableHead className="text-right font-bold text-foreground">
                Positions
              </TableHead>
              <TableHead className="text-right font-bold text-foreground">
                Score
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregates.map((agg) => (
              <TableRow
                key={agg.query}
                className={twMerge(
                  agg.positions.some((p) => p !== null) &&
                    "bg-green-100 hover:bg-green-100/80",
                )}
              >
                <TableCell className="text-foreground/60 text-xs">
                  {agg.group}
                </TableCell>
                <TableCell className="max-w-xs truncate">{agg.query}</TableCell>
                <TableCell className="text-right">
                  {agg.positions.join(", ")}
                </TableCell>
                <TableCell className="text-right">
                  {agg.score.toFixed(0)}
                </TableCell>
                <TableCell>
                  <Link to={`/site/${site.id}/citation/${agg.id}`}>
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold">
                Average
              </TableCell>
              <TableCell className="text-right font-bold" />
              <TableCell className="text-right font-bold">
                {(mean(aggregates.map((a) => a.score)) || 0).toFixed(1)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
