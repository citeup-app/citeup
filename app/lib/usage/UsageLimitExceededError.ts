import type { ACCOUNT_LIMITS } from "./costConfig";

export class UsageLimitExceededError extends Error {
  public readonly current: number;
  public readonly limit: number;
  public readonly timeWindow: keyof typeof ACCOUNT_LIMITS;

  constructor({
    current,
    limit,
    timeWindow,
  }: {
    current: number;
    limit: number;
    timeWindow: keyof typeof ACCOUNT_LIMITS;
  }) {
    super(`${timeWindow} cost limit exceeded: ${current} / ${limit}`);
    this.current = current;
    this.limit = limit;
    this.timeWindow = timeWindow;
    this.name = "UsageLimitExceededError";
  }
}
