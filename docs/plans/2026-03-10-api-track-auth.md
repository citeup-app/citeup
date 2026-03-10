# API Track Auth & Bot Tracker Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add API key auth to `POST /api/track`, ship a standalone bot tracker client library, and have the CiteUp server self-track bot visits in production.

**Architecture:** A `cuid()`-generated `apiKey` field on `Account` gates the track endpoint — the route checks the Bearer token, resolves the account, then verifies the URL domain is one of the account's sites before calling `recordBotVisit`. A standalone `botTracker.ts` library (zero app deps, fire-and-forget `fetch`) handles the HTTP call. `selfTracker.server.ts` wraps it for production self-tracking, called from `entry.server.tsx`.

**Tech Stack:** Prisma (schema change), React Router route action, TypeScript, Vitest (HTTP tests)

---

### Task 1: Add `apiKey` to Account schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the field**

In `prisma/schema.prisma`, update the `Account` model:

```prisma
model Account {
  id        String   @id @default(cuid())
  createdAt DateTime @map("created_at") @default(now())
  apiKey    String   @unique @default(cuid()) @map("api_key")
  hostname  String?  @map("hostname")
  users     User[]
  sites     Site[]
  usageEvents UsageEvent[]

  @@map("accounts")
}
```

**Step 2: Push schema and regenerate client**

```bash
pnpm prisma db push
pnpm prisma generate
```

Expected: no errors, `prisma/generated/` updated.

**Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: passes.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/generated/
git commit -m "feat: add apiKey field to Account model"
```

---

### Task 2: Write failing auth tests

**Files:**
- Modify: `test/routes/api.track.test.ts`

**Step 1: Update seed data with known apiKey**

In the `beforeAll`, add `apiKey` to the account creation:

```ts
await prisma.account.create({
  data: {
    id: "account-apitrack-1",
    apiKey: "test-api-key-apitrack-1",
    users: {
      create: {
        id: "user-apitrack-1",
        email: "apitrack@test.com",
        passwordHash: "test",
      },
    },
    sites: {
      create: { id: "site-apitrack-1", domain: "apitrack.example.com" },
    },
  },
});
```

**Step 2: Add a second account for cross-account domain tests**

Still inside `beforeAll`, after the first create:

```ts
await prisma.account.create({
  data: {
    id: "account-apitrack-2",
    apiKey: "test-api-key-apitrack-2",
    sites: {
      create: { id: "site-apitrack-2", domain: "other-apitrack.example.com" },
    },
    users: {
      create: {
        id: "user-apitrack-2",
        email: "apitrack2@test.com",
        passwordHash: "test",
      },
    },
  },
});
```

**Step 3: Update the `post()` helper to accept headers**

Replace the `post()` function:

```ts
async function post(body: unknown, headers: Record<string, string> = {}) {
  return await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function authHeader() {
  return { Authorization: "Bearer test-api-key-apitrack-1" };
}
```

**Step 4: Add auth header to all existing tracking tests**

Every call in the `tracking` describe block that posts to a known domain needs `authHeader()`. Examples:

```ts
// includes CORS headers
const res = await post({ url: "https://apitrack.example.com/", ... }, authHeader());

// does not track a regular browser visit
const res = await post({ url: "https://apitrack.example.com/", ... }, authHeader());

// returns tracked:false when domain is unknown — no auth needed, but add it anyway
const res = await post({ url: "https://unknown-domain-xyz.example.com/", ... }, authHeader());

// tracks a bot visit
const res = await post({ url: "https://apitrack.example.com/about", ... }, authHeader());

// increments count
await post({ url: "https://apitrack.example.com/repeated", ... }, authHeader());
await post({ url: "https://apitrack.example.com/repeated", ... }, authHeader());
```

**Step 5: Add new auth describe block**

Append a new `describe("auth", ...)` block:

```ts
describe("auth", () => {
  it("returns 403 when Authorization header is missing", async () => {
    const res = await post({
      url: "https://apitrack.example.com/",
      userAgent: "GPTBot/1.0",
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when API key is wrong", async () => {
    const res = await post(
      { url: "https://apitrack.example.com/", userAgent: "GPTBot/1.0" },
      { Authorization: "Bearer wrong-key" },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when domain belongs to a different account", async () => {
    // account-apitrack-1's key used for account-apitrack-2's domain
    const res = await post(
      { url: "https://other-apitrack.example.com/", userAgent: "GPTBot/1.0" },
      authHeader(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with valid key and matching domain", async () => {
    const res = await post(
      { url: "https://apitrack.example.com/auth-test", userAgent: "GPTBot/1.0" },
      authHeader(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracked).toBe(true);
  });
});
```

**Step 6: Run tests to confirm they fail**

```bash
pnpm vitest run test/routes/api.track.test.ts
```

Expected: auth tests fail with 200 instead of 403, existing tracking tests fail with 403 (since route doesn't check auth yet).

---

### Task 3: Add auth to the `api/track` route

**Files:**
- Modify: `app/routes/api.track.ts`
- Modify: `app/lib/botTracking.server.ts`

**Step 1: Update `recordBotVisit` to accept an optional pre-resolved site**

In `app/lib/botTracking.server.ts`, update the function signature and skip the DB lookup when `site` is provided:

```ts
export default async function recordBotVisit({
  accept,
  ip,
  referer,
  url,
  userAgent,
  site: resolvedSite,
}: {
  accept: string | null;
  ip: string | null;
  referer: string | null;
  url: string;
  userAgent: string | null;
  site?: { id: string };
}): Promise<{ tracked: boolean; reason?: string }> {
  if (!userAgent) return { tracked: false, reason: "no user agent" };

  const botType = classifyBot(userAgent);
  if (!botType) return { tracked: false, reason: "not a bot" };
  if (/Better Stack/i.test(userAgent))
    return { tracked: false, reason: "excluded" };

  const { hostname, pathname } = new URL(url);
  const domain = hostname.toLowerCase();
  const site = resolvedSite ?? await prisma.site.findFirst({ where: { domain } });
  if (!site) return { tracked: false, reason: "site not found" };

  // ... rest unchanged
```

**Step 2: Rewrite `app/routes/api.track.ts`**

```ts
import { z } from "zod";
import prisma from "~/lib/prisma.server";
import recordBotVisit from "~/lib/botTracking.server";
import type { Route } from "./+types/api.track";

const BotTrackSchema = z.object({
  url: z.url(),
  userAgent: z.string().nullable().optional(),
  accept: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  referer: z.string().nullable().optional(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function forbidden() {
  return Response.json(
    { tracked: false, reason: "Forbidden" },
    { status: 403, headers: CORS_HEADERS },
  );
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (request.method !== "POST")
    return Response.json(
      { tracked: false, reason: "Method not allowed" },
      { status: 405, headers: CORS_HEADERS },
    );

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return forbidden();
  const apiKey = authHeader.slice(7);

  let body: unknown;
  let data: z.infer<typeof BotTrackSchema>;
  try {
    body = await request.json();
    const parsed = BotTrackSchema.safeParse(body);
    if (parsed.error) throw new Error(parsed.error.message);
    data = parsed.data;
  } catch {
    return Response.json(
      { tracked: false, reason: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const hostname = new URL(data.url).hostname.toLowerCase();
  const site = await prisma.site.findFirst({
    where: { domain: hostname, account: { apiKey } },
  });
  if (!site) return forbidden();

  const { url: rawUrl, userAgent, accept, ip, referer } = data;
  const { tracked, reason } = await recordBotVisit({
    url: rawUrl,
    userAgent: userAgent || null,
    accept: accept || null,
    ip: ip || null,
    referer: referer || null,
    site,
  });
  return Response.json({ tracked, reason }, { headers: CORS_HEADERS });
}

export async function loader() {
  return Response.json(
    { tracked: false, reason: "Method not allowed" },
    { status: 405 },
  );
}
```

**Step 3: Run tests**

```bash
pnpm vitest run test/routes/api.track.test.ts
```

Expected: all tests pass.

**Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

**Step 5: Commit**

```bash
git add app/routes/api.track.ts app/lib/botTracking.server.ts test/routes/api.track.test.ts
git commit -m "feat: add API key auth to /api/track endpoint"
```

---

### Task 4: Write the `botTracker.ts` client library

**Files:**
- Create: `app/lib/botTracker.ts`

**Step 1: Write the library**

```ts
export type BotTrackerConfig = {
  apiKey: string;
  endpoint: string;
};

export type BotTrackPayload = {
  url: string;
  userAgent?: string | null;
  accept?: string | null;
  ip?: string | null;
  referer?: string | null;
};

export type BotTracker = {
  track: (payload: BotTrackPayload) => void;
};

export function createBotTracker({
  apiKey,
  endpoint,
}: BotTrackerConfig): BotTracker {
  return {
    track({ url, userAgent, accept, ip, referer }) {
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url, userAgent, accept, ip, referer }),
      }).catch(() => {});
    },
  };
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

**Step 3: Commit**

```bash
git add app/lib/botTracker.ts
git commit -m "feat: add standalone bot tracker client library"
```

---

### Task 5: Self-tracking in production

**Files:**
- Create: `app/lib/selfTracker.server.ts`
- Modify: `app/entry.server.tsx`

**Step 1: Write `selfTracker.server.ts`**

```ts
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
```

**Step 2: Update `entry.server.tsx`**

Add the import after the existing imports:

```ts
import { trackRequest } from "./lib/selfTracker.server";
```

Inside the Sentry-wrapped default export, fire tracking before `handleRequest`:

```ts
export default Sentry.wrapSentryHandleRequest(
  async (
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext?: any,
  ) => {
    trackRequest(request); // fire-and-forget, production only
    const start = Date.now();
    logger("%s %s", request.method, request.url);
    // ... rest unchanged
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

**Step 4: Commit**

```bash
git add app/lib/selfTracker.server.ts app/entry.server.tsx
git commit -m "feat: self-track bot visits via selfTracker in production"
```

---

### Task 6: Final verification

**Step 1: Run the full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass (including `test/routes/api.track.test.ts`).

**Step 2: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: no errors.
