import { createAnthropic } from "@ai-sdk/anthropic";
import envVars from "~/lib/envVars";

const anthropic = createAnthropic({
  apiKey: envVars.ANTHROPIC_API_KEY,
});

export const haiku = anthropic("claude-haiku-4-5-20251001");
