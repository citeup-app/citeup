import { describe, expect, it } from "vitest";
import calculateCitationMetrics from "~/lib/llm-visibility/calculateCitationMetrics";

describe("calculateCitationMetrics", () => {
  it("returns 0 citations and 0 score when no citations", () => {
    const result = calculateCitationMetrics([], "example.com");
    expect(result).toEqual({ totalCitations: 0, avgScore: 0 });
  });

  it("calculates score: 50 for position 0, 10 for others", () => {
    const queries = [
      {
        citations: ["example.com"],
      },
      {
        citations: ["other.com", "example.com"],
      },
    ];
    const result = calculateCitationMetrics(queries, "example.com");
    expect(result.totalCitations).toBe(2);
    expect(result.avgScore).toBe((50 + 10) / 2); // 30
  });

  it("counts only citations mentioning the domain", () => {
    const queries = [
      { citations: ["example.com"] },
      { citations: ["other.com"] },
      { citations: ["example.com", "another.com"] },
    ];
    const result = calculateCitationMetrics(queries, "example.com");
    expect(result.totalCitations).toBe(2);
  });
});
