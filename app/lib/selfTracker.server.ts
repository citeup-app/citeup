import { createBotTracker } from "./botTracker";

const apiKey = process.env.SELF_TRACKER_API_KEY;
const endpoint = process.env.SELF_TRACKER_URL;

const tracker =
  apiKey && endpoint ? createBotTracker({ apiKey, endpoint }) : null;

export function trackRequest(request: Request): void {
  if (process.env.NODE_ENV !== "production" || !tracker) return;
  tracker.track({
    url: request.url,
    userAgent: request.headers.get("user-agent"),
    accept: request.headers.get("accept"),
    referer: request.headers.get("referer"),
  });
}
