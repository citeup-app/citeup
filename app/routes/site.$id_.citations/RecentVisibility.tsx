import { groupBy, mean } from "es-toolkit";
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
import type { CitationQuery, Prisma } from "~/prisma";

function computeMetrics(reps: CitationQuery[]): {
  visibilityPct: number;
  avgCitations: number;
  score: number;
} {
  if (reps.length === 0) return { visibilityPct: 0, avgCitations: 0, score: 0 };

  const visibilityPct = mean(reps.map((q) => (q.position !== null ? 100 : 0)));
  const avgCitations = mean(reps.map((q) => q.citations.length));
  const score = mean(
    reps.map((q) => {
      if (q.position === null) return 0;
      if (q.position === 0) return 50;
      return Math.max(0, 10 * (q.citations.length - q.position));
    }),
  );

  return { visibilityPct, avgCitations, score };
}

export default function RecentVisibility({
  run,
}: {
  run: Prisma.CitationQueryRunGetPayload<{ include: { queries: true } }>;
}) {
  const grouped = groupBy(run.queries, (q) => q.query);

  const aggregates = Object.entries(grouped).map(([query, reps]) => ({
    query,
    group: reps[0].group,
    ...computeMetrics(reps),
  }));

  const totals = {
    visibilityPct: mean(aggregates.map((a) => a.visibilityPct)) || 0,
    avgCitations: mean(aggregates.map((a) => a.avgCitations)) || 0,
    score: mean(aggregates.map((a) => a.score)) || 0,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Recent Run</CardTitle>
        <CardDescription>
          {new Date(run.createdAt).toLocaleDateString()} · {run.model} ·{" "}
          {run.queries.length} checks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold text-foreground">Query</TableHead>
              <TableHead className="font-bold text-foreground">Group</TableHead>
              <TableHead className="text-right font-bold text-foreground">
                Visibility
              </TableHead>
              <TableHead className="text-right font-bold text-foreground">
                Avg Citations
              </TableHead>
              <TableHead className="text-right font-bold text-foreground">
                Score
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregates.map((agg) => (
              <TableRow
                key={agg.query}
                className={twMerge(
                  agg.visibilityPct > 0 && "bg-green-100 hover:bg-green-100/80",
                )}
              >
                <TableCell className="max-w-xs truncate">{agg.query}</TableCell>
                <TableCell className="text-foreground/60 text-xs">
                  {agg.group}
                </TableCell>
                <TableCell className="text-right">
                  {agg.visibilityPct.toFixed(0)}%
                </TableCell>
                <TableCell className="text-right">
                  {agg.avgCitations.toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  {agg.score.toFixed(1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold">
                Average
              </TableCell>
              <TableCell className="text-right font-bold">
                {totals.visibilityPct.toFixed(0)}%
              </TableCell>
              <TableCell className="text-right font-bold">
                {totals.avgCitations.toFixed(1)}
              </TableCell>
              <TableCell className="text-right font-bold">
                {totals.score.toFixed(1)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
