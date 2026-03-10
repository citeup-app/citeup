import { beforeEach, describe, expect, it } from "vitest";
import prisma from "~/lib/prisma.server";
import { UsageLimitExceededError } from "~/lib/usage/UsageLimitExceededError";
import {
  checkUsageLimits,
  recordUsageEvent,
} from "~/lib/usage/usageLimit.server";

const ACCOUNT_ID = "test-usage-account-1";

beforeEach(async () => {
  await prisma.usageEvent.deleteMany({ where: { accountId: ACCOUNT_ID } });
  // Ensure account exists
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    create: { id: ACCOUNT_ID },
    update: {},
  });
});

describe("recordUsageEvent", () => {
  it("inserts a UsageEvent row with computed cost", async () => {
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const events = await prisma.usageEvent.findMany({
      where: { accountId: ACCOUNT_ID },
    });
    expect(events).toHaveLength(1);
    // $1.00 input + $5.00 output = $6.00
    expect(Number(events[0].cost)).toBeCloseTo(6.0);
    expect(events[0].inputTokens).toBe(1_000_000);
    expect(events[0].outputTokens).toBe(1_000_000);
  });
});

describe("checkUsageLimits", () => {
  it("passes when no events exist", async () => {
    await expect(checkUsageLimits(ACCOUNT_ID)).resolves.toBeUndefined();
  });

  it("throws UsageLimitExceededError when hourly cost is exceeded", async () => {
    // Insert enough events to exceed $2.00/hour limit
    // claude-haiku: $1/M input + $5/M output; 500k output = $2.50 > $2 limit
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 500_000,
    });

    await expect(checkUsageLimits(ACCOUNT_ID)).rejects.toThrow(
      UsageLimitExceededError,
    );
  });

  it("throws with correct window and limitType", async () => {
    await recordUsageEvent({
      accountId: ACCOUNT_ID,
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 500_000,
    });

    try {
      await checkUsageLimits(ACCOUNT_ID);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageLimitExceededError);
      const e = error as UsageLimitExceededError;
      expect(e.timeWindow).toBe("hourly");
      expect(Number(e.current)).toBeGreaterThan(2.0);
      expect(Number(e.limit)).toBe(2.0);
    }
  });
});
