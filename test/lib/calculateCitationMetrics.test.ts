import { describe, expect, it } from "vitest";
import calculateCitationMetrics from "~/lib/llm-visibility/calculateCitationMetrics";

describe("calculateCitationMetrics", () => {
  it("returns 0 citations and 0 score when no citations", () => {
    const result = calculateCitationMetrics({
      domain: "example.com",
      queries: [],
    });
    expect(result).toEqual({
      totalCitations: 0,
      citationsToDomain: 0,
      score: 0,
    });
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
    const result = calculateCitationMetrics({
      domain: "example.com",
      queries: queries,
    });
    expect(result.totalCitations).toBe(3);
    expect(result.citationsToDomain).toBe(2);
    expect(result.score).toBeCloseTo(66.67, 0.01); // 2/3 = 66.67%
  });

  it("counts only citations mentioning the domain", () => {
    const queries = [
      { citations: ["example.com"] },
      { citations: ["other.com"] },
      { citations: ["example.com", "another.com"] },
    ];
    const result = calculateCitationMetrics({
      domain: "example.com",
      queries: queries,
    });
    expect(result.totalCitations).toBe(4);
    expect(result.citationsToDomain).toBe(2);
    expect(result.score).toBe(50); // 2/4 = 50%
  });
});
