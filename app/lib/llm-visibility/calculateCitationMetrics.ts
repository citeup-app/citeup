/**
 * Returns total number of citations, citations to the domain and average score
 * (percentage of citations to the domain)
 *
 * @param domain - Domain to calculate metrics for
 * @param queries - Array of queries with citations
 * @returns Total number of citations, citations to the domain and average score
 */
export default function calculateCitationMetrics({
  domain,
  citations,
}: {
  domain: string;
  citations: string[];
}): {
  citationsToDomain: number;
  score: number;
  totalCitations: number;
} {
  const totalCitations = citations.length;
  const urls = citations.map((citation) =>
    /^https?:\/\//.test(citation)
      ? new URL(citation)
      : new URL(`https://${citation}`),
  );
  const citationsToDomain = urls.filter(
    ({ hostname }) => hostname === domain,
  ).length;

  const score =
    totalCitations === 0 ? 0 : (citationsToDomain / totalCitations) * 100;
  return { citationsToDomain, score, totalCitations };
}
