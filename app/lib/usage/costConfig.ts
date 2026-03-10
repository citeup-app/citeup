export type TokenCost = { inputPerM: number; outputPerM: number };
export type RequestCost = { perRequest: number };
export type PlatformCost = TokenCost | RequestCost;

export function isTokenCost(cost: PlatformCost): cost is TokenCost {
  return "inputPerM" in cost;
}

// Keyed by exact model ID string used in generateText calls.
// Add new models here when platform clients are updated.
export const PLATFORM_COSTS: Record<string, PlatformCost> = {
  "claude-haiku-4-5-20251001": { inputPerM: 1.00, outputPerM: 5.00 },
  "gpt-5-chat-latest":         { inputPerM: 1.25, outputPerM: 10.00 },
  "gemini-2.5-flash":          { inputPerM: 0.30, outputPerM: 2.50 },
  "sonar":                     { inputPerM: 1.00, outputPerM: 1.00 },
};

// Aggregate limits per account across all platforms.
export const ACCOUNT_LIMITS = {
  hourly:  { costUsd: 2.00,   requests: 500   },
  daily:   { costUsd: 20.00,  requests: 5000  },
  monthly: { costUsd: 100.00, requests: 50000 },
} as const;

export type LimitWindow = keyof typeof ACCOUNT_LIMITS;
export type LimitType = "cost" | "requests";
