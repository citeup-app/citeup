import { invariant } from "es-toolkit";

export type ModelPricing =
  | { costPerInputM: number; costPerOutputM: number }
  | { perRequest: number };

export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost = MODEL_PRICING[model];
  invariant(cost, `Unknown model: ${model}`);
  return "perRequest" in cost
    ? cost.perRequest
    : (inputTokens / 1_000_000) * cost.costPerInputM +
        (outputTokens / 1_000_000) * cost.costPerOutputM;
}

// Keyed by exact model ID string used in generateText calls.
// Add new models here when model pricing is updated.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": { costPerInputM: 1.0, costPerOutputM: 5.0 },
  "gpt-5-chat-latest": { costPerInputM: 1.25, costPerOutputM: 10.0 },
  "gemini-2.5-flash": { costPerInputM: 0.3, costPerOutputM: 2.5 },
  sonar: { costPerInputM: 1.0, costPerOutputM: 1.0 },
};

// Aggregate limits per account across all models.
export const ACCOUNT_LIMITS = {
  hourly: { costUsd: 2.0, requests: 500 },
  daily: { costUsd: 5.0, requests: 1000 },
  monthly: { costUsd: 20.0, requests: 5000 },
} as const;
