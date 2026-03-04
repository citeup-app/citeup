interface MetricsResult {
  totalCitations: number;
  avgScore: number;
}

export default function calculateCitationMetrics(
  queries: { citations: string[] }[],
  domain: string,
): MetricsResult {
  let totalScore = 0;
  let totalCitations = 0;

  for (const query of queries) {
    const position = query.citations.indexOf(domain);
    if (position !== -1) {
      totalCitations++;
      totalScore += position === 0 ? 50 : 10;
    }
  }

  return {
    totalCitations,
    avgScore: totalCitations === 0 ? 0 : totalScore / totalCitations,
  };
}
