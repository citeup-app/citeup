import type { LimitType, LimitWindow } from "./costConfig";

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly window: LimitWindow,
    public readonly limitType: LimitType,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`${window} ${limitType} limit exceeded: ${current} / ${limit}`);
    this.name = "UsageLimitExceededError";
  }
}
