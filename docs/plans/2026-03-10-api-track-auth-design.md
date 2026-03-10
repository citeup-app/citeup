# API Track Auth & Bot Tracker Library

## Overview

Add API key authentication to `POST /api/track`, enforce that the tracked URL belongs to the authenticating account's sites, ship a standalone client library, and have the CiteUp server track its own bot traffic in production.

## Schema

Add `apiKey` to `Account`, auto-generated with `cuid()`:

```prisma
model Account {
  id     String @id @default(cuid())
  apiKey String @unique @default(cuid()) @map("api_key")
  ...
}
```

## Route Auth (`app/routes/api.track.ts`)

1. Extract `Authorization: Bearer <key>` → missing or malformed → **403**
2. Look up account by `apiKey` → not found → **403**
3. Parse URL domain, check `site` where `accountId = account.id AND domain = hostname` → not found → **403**
4. Pass the resolved `site` directly to `recordBotVisit`, skipping its internal domain lookup

All three failure modes return the same 403 — no information leakage.

## `recordBotVisit` change

Accept an optional `site` parameter. When provided, skip the `prisma.site.findFirst` call.

## Client Library (`app/lib/botTracker.ts`)

Standalone ESM module, zero app-specific imports, publishable as its own npm package.

```ts
const tracker = createBotTracker({
  apiKey: "key",
  endpoint: "https://citeup.io/api/track",
});

tracker.track({ url, userAgent, accept, ip, referer });
```

- `createBotTracker({ apiKey, endpoint })` → `{ track }`
- `track()` is fire-and-forget: no `await`, silent `catch`
- Uses `fetch` only (Node 18+)

## Self-Tracking (`app/entry.server.tsx`)

- New module `app/lib/selfTracker.server.ts` creates a tracker from env vars and exports `trackRequest(request: Request)`
- Env vars: `SELF_TRACKER_API_KEY`, `SELF_TRACKER_URL`
- Only fires when `NODE_ENV === "production"`
- Called from `handleRequest` in `entry.server.tsx`, fire-and-forget

## Tests

Update existing tests: add `Authorization` header to all tracked requests.

New cases in `test/routes/api.track.test.ts`:

- Missing `Authorization` header → 403
- Wrong API key → 403
- Valid key but domain not in account's sites → 403
- Valid key + domain in account → 200 `{ tracked: true }`
