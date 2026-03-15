# Monitoring API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add a REST API for monitoring cite.me.in data — an admin API (single secret) and a user API (per-user key) covering users, sites, citation runs, and run details.

**Architecture:** Five GET-only JSON endpoints under `/api/` and `/api/admin/`. A new `api-auth.server.ts` module provides auth helpers that throw `Response.json(...)` on failure, following the same throw-for-errors pattern used by `requireSiteAccess`. A new `apiKey` field on the `User` model enables per-user API key auth; the profile page gains a section to generate and copy it.

**Tech Stack:** React Router loaders (GET), Prisma, `random-password-toolkit` (already used for site keys), existing `requireSiteAccess` helper for access control.

**Task IDs:** #7 #8 #9 #10 #11 #12 #13 #14 #15

---

### Task 1: Add `ADMIN_API_SECRET` to env vars (Task #7)

**Files:**
- Modify: `app/lib/envVars.ts`

**Step 1: Add the env var**

In `app/lib/envVars.ts`, add inside the `envVars` object (after `CRON_SECRET`):

```ts
ADMIN_API_SECRET: env.get("ADMIN_API_SECRET").required(false).asString(),
```

**Step 2: Verify typechecks**

```bash
pnpm typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/lib/envVars.ts
git commit -m "feat: add ADMIN_API_SECRET env var"
```

---

### Task 2: Add `apiKey` field to User model (Task #8)

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the field**

In the `User` model, add after `id`:

```prisma
apiKey  String?  @map("api_key") @unique
```

**Step 2: Push schema and regenerate**

```bash
pnpm prisma db push
pnpm prisma generate
```

Expected: migration applied, no errors.

**Step 3: Verify typechecks**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add apiKey field to User model"
```

---

### Task 3: Create API auth helpers (Task #9)

**Files:**
- Create: `app/lib/api-auth.server.ts`
- Test: `test/routes/api-auth.test.ts`

**Step 1: Write the failing test**

Create `test/routes/api-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { requireAdminApiKey, requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";

const TEST_ADMIN_SECRET = "test-admin-secret";

function makeRequest(token?: string) {
  return new Request("http://localhost/api/test", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("requireAdminApiKey", () => {
  it("returns undefined when token matches ADMIN_API_SECRET", async () => {
    process.env.ADMIN_API_SECRET = TEST_ADMIN_SECRET;
    const result = await requireAdminApiKey(makeRequest(TEST_ADMIN_SECRET));
    expect(result).toBeUndefined();
  });

  it("throws 401 when token is wrong", async () => {
    process.env.ADMIN_API_SECRET = TEST_ADMIN_SECRET;
    await expect(requireAdminApiKey(makeRequest("wrong"))).rejects.toBeInstanceOf(Response);
    const err = await requireAdminApiKey(makeRequest("wrong")).catch((e) => e as Response);
    expect(err.status).toBe(401);
  });

  it("throws 401 when no Authorization header", async () => {
    const err = await requireAdminApiKey(makeRequest()).catch((e) => e as Response);
    expect(err.status).toBe(401);
  });
});

describe("requireUserByApiKey", () => {
  const userId = "api-auth-user-1";
  const userApiKey = "cite.me.in_test_api_key_abc123";

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-auth@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
      },
      update: { apiKey: userApiKey },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns user when token matches", async () => {
    const user = await requireUserByApiKey(makeRequest(userApiKey));
    expect(user.id).toBe(userId);
  });

  it("throws 401 when token is unknown", async () => {
    const err = await requireUserByApiKey(makeRequest("unknown")).catch((e) => e as Response);
    expect(err.status).toBe(401);
  });

  it("throws 401 when no Authorization header", async () => {
    const err = await requireUserByApiKey(makeRequest()).catch((e) => e as Response);
    expect(err.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api-auth.test.ts
```

Expected: FAIL — `~/lib/api-auth.server` not found.

**Step 3: Implement the helpers**

Create `app/lib/api-auth.server.ts`:

```ts
import envVars from "~/lib/envVars";
import prisma from "~/lib/prisma.server";
import type { User } from "~/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireAdminApiKey(request: Request): Promise<void> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw unauthorized();
  const token = auth.slice(7);
  if (!envVars.ADMIN_API_SECRET || token !== envVars.ADMIN_API_SECRET)
    throw unauthorized();
}

export async function requireUserByApiKey(request: Request): Promise<User> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw unauthorized();
  const token = auth.slice(7);
  const user = await prisma.user.findUnique({ where: { apiKey: token } });
  if (!user) throw unauthorized();
  return user;
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api-auth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/lib/api-auth.server.ts test/routes/api-auth.test.ts
git commit -m "feat: add API auth helpers for admin key and user API key"
```

---

### Task 4: `GET /api/admin/users` (Task #10)

**Files:**
- Create: `app/routes/api.admin.users.ts`
- Test: `test/routes/api.admin.users.test.ts`

**Step 1: Write the failing test**

Create `test/routes/api.admin.users.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";

const BASE = "http://localhost:5173";
const ADMIN_SECRET = "test-admin-secret-1";

function get(token?: string) {
  return fetch(`${BASE}/api/admin/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/admin/users", () => {
  const userId = "admin-users-user-1";

  beforeAll(async () => {
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "admin-users@test.example",
        passwordHash: await hashPassword("password"),
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong token", async () => {
    const res = await get("wrong");
    expect(res.status).toBe(401);
  });

  it("returns users list with correct token", async () => {
    const res = await get(ADMIN_SECRET);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("users");
    expect(Array.isArray(body.users)).toBe(true);
    const user = body.users.find((u: { id: string }) => u.id === userId);
    expect(user).toBeDefined();
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("createdAt");
    expect(user).toHaveProperty("sites");
    expect(Array.isArray(user.sites)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api.admin.users.test.ts
```

Expected: FAIL — 404 or connection error.

**Step 3: Implement the route**

Create `app/routes/api.admin.users.ts`:

```ts
import { requireAdminApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.admin.users";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminApiKey(request);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      ownedSites: {
        select: { domain: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    users: users.map(({ ownedSites, ...user }) => ({
      ...user,
      sites: ownedSites,
    })),
  });
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api.admin.users.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/routes/api.admin.users.ts test/routes/api.admin.users.test.ts
git commit -m "feat: add GET /api/admin/users endpoint"
```

---

### Task 5: `GET /api/me` (Task #11)

**Files:**
- Create: `app/routes/api.me.ts`
- Test: `test/routes/api.me.test.ts`

**Step 1: Write the failing test**

Create `test/routes/api.me.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";
import { generateApiKey } from "random-password-toolkit";

const BASE = "http://localhost:5173";

function get(token?: string) {
  return fetch(`${BASE}/api/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/me", () => {
  const userId = "api-me-user-1";
  const userApiKey = `cite.me.in_${generateApiKey(16)}`;

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-me@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
      },
      update: { apiKey: userApiKey },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("returns current user and their sites", async () => {
    const res = await get(userApiKey);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(userId);
    expect(body.email).toBe("api-me@test.example");
    expect(body).toHaveProperty("createdAt");
    expect(Array.isArray(body.sites)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api.me.test.ts
```

**Step 3: Implement the route**

Create `app/routes/api.me.ts`:

```ts
import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.me";

export async function loader({ request }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      ownedSites: {
        select: { domain: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const { ownedSites, ...rest } = user;
  return Response.json({ ...rest, sites: ownedSites });
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api.me.test.ts
```

**Step 5: Commit**

```bash
git add app/routes/api.me.ts test/routes/api.me.test.ts
git commit -m "feat: add GET /api/me endpoint"
```

---

### Task 6: `GET /api/sites/:domain` (Task #12)

**Files:**
- Create: `app/routes/api.sites.$domain.ts`
- Test: `test/routes/api.sites.domain.test.ts`

**Step 1: Write the failing test**

Create `test/routes/api.sites.domain.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";
import { generateApiKey } from "random-password-toolkit";

const BASE = "http://localhost:5173";

function get(domain: string, token?: string) {
  return fetch(`${BASE}/api/sites/${domain}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/sites/:domain", () => {
  const userId = "api-site-domain-user-1";
  const siteId = "api-site-domain-site-1";
  const userApiKey = `cite.me.in_${generateApiKey(16)}`;
  const domain = "api-site-domain-test.example";

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-site-domain@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
      },
      update: { apiKey: userApiKey },
    });
    await prisma.site.upsert({
      where: { id: siteId },
      create: {
        id: siteId,
        domain,
        ownerId: userId,
        apiKey: `site_${generateApiKey(16)}`,
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.site.delete({ where: { id: siteId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await get(domain);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown domain", async () => {
    const res = await get("not-a-real-domain.example", userApiKey);
    expect(res.status).toBe(404);
  });

  it("returns site with users and roles", async () => {
    const res = await get(domain, userApiKey);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe(domain);
    expect(body).toHaveProperty("createdAt");
    expect(Array.isArray(body.users)).toBe(true);
    const owner = body.users.find((u: { id: string }) => u.id === userId);
    expect(owner).toBeDefined();
    expect(owner.role).toBe("owner");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api.sites.domain.test.ts
```

**Step 3: Implement the route**

Create `app/routes/api.sites.$domain.ts`:

```ts
import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);

  const site = await prisma.site.findFirst({
    where: {
      domain: params.domain,
      OR: [
        { ownerId: authUser.id },
        { siteUsers: { some: { userId: authUser.id } } },
      ],
    },
    select: {
      domain: true,
      createdAt: true,
      ownerId: true,
      siteUsers: {
        select: { user: { select: { id: true, email: true } } },
      },
      owner: { select: { id: true, email: true } },
    },
  });

  if (!site) return Response.json({ error: "Not found" }, { status: 404 });

  const users = [
    { ...site.owner, role: "owner" as const },
    ...site.siteUsers.map(({ user }) => ({ ...user, role: "member" as const })),
  ];

  return Response.json({ domain: site.domain, createdAt: site.createdAt, users });
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api.sites.domain.test.ts
```

**Step 5: Commit**

```bash
git add app/routes/api.sites.$domain.ts test/routes/api.sites.domain.test.ts
git commit -m "feat: add GET /api/sites/:domain endpoint"
```

---

### Task 7: `GET /api/sites/:domain/runs` (Task #13)

**Files:**
- Create: `app/routes/api.sites.$domain_.runs.ts`

**Step 1: Write the failing test**

Add to `test/routes/api.sites.domain.test.ts` a new `describe` block (or create a separate file `test/routes/api.sites.runs.test.ts`):

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";
import { generateApiKey } from "random-password-toolkit";

const BASE = "http://localhost:5173";

describe("GET /api/sites/:domain/runs", () => {
  const userId = "api-runs-user-1";
  const siteId = "api-runs-site-1";
  const runId = "api-runs-run-1";
  const userApiKey = `cite.me.in_${generateApiKey(16)}`;
  const domain = "api-runs-test.example";

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-runs@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
      },
      update: { apiKey: userApiKey },
    });
    await prisma.site.upsert({
      where: { id: siteId },
      create: { id: siteId, domain, ownerId: userId, apiKey: `site_${generateApiKey(16)}` },
      update: {},
    });
    await prisma.citationQueryRun.upsert({
      where: { id: runId },
      create: {
        id: runId,
        siteId,
        platform: "chatgpt",
        model: "gpt-4o",
        queries: {
          create: [{
            query: "best retail platforms",
            group: "retail",
            extraQueries: [],
            text: "Some answer",
            citations: ["https://api-runs-test.example/page"],
          }],
        },
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.citationQueryRun.delete({ where: { id: runId } });
    await prisma.site.delete({ where: { id: siteId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await fetch(`${BASE}/api/sites/${domain}/runs`);
    expect(res.status).toBe(401);
  });

  it("returns runs with counts", async () => {
    const res = await fetch(`${BASE}/api/sites/${domain}/runs`, {
      headers: { Authorization: `Bearer ${userApiKey}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBe(true);
    const run = body.runs.find((r: { id: string }) => r.id === runId);
    expect(run).toBeDefined();
    expect(run.platform).toBe("chatgpt");
    expect(run.queryCount).toBe(1);
    expect(run.citationCount).toBe(1);
  });

  it("filters by ?since param", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await fetch(`${BASE}/api/sites/${domain}/runs?since=${future}`, {
      headers: { Authorization: `Bearer ${userApiKey}` },
    });
    const body = await res.json();
    expect(body.runs).toHaveLength(0);
  });
});
```

Save as `test/routes/api.sites.runs.test.ts`.

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api.sites.runs.test.ts
```

**Step 3: Implement the route**

Create `app/routes/api.sites.$domain_.runs.ts`:

```ts
import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import { requireSiteAccess } from "~/lib/sites.server";
import type { Route } from "./+types/api.sites.$domain_.runs";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);
  const site = await requireSiteAccess(params.domain, authUser.id);

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : undefined;

  const runs = await prisma.citationQueryRun.findMany({
    where: {
      siteId: site.id,
      ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
    },
    select: {
      id: true,
      platform: true,
      model: true,
      createdAt: true,
      queries: { select: { citations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    runs: runs.map(({ queries, ...run }) => ({
      ...run,
      queryCount: queries.length,
      citationCount: queries.reduce((sum, q) => sum + q.citations.length, 0),
    })),
  });
}
```

Note: `requireSiteAccess` throws a `Response` (404) if the user doesn't have access — React Router will catch and return it as-is, so 404 responses work correctly.

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api.sites.runs.test.ts
```

**Step 5: Commit**

```bash
git add app/routes/api.sites.$domain_.runs.ts test/routes/api.sites.runs.test.ts
git commit -m "feat: add GET /api/sites/:domain/runs endpoint"
```

---

### Task 8: `GET /api/sites/:domain/runs/:runId` (Task #14)

**Files:**
- Create: `app/routes/api.sites.$domain_.runs.$runId.ts`

**Step 1: Write the failing test**

Create `test/routes/api.sites.runDetail.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import prisma from "~/lib/prisma.server";
import { hashPassword } from "~/lib/auth.server";
import { generateApiKey } from "random-password-toolkit";

const BASE = "http://localhost:5173";

describe("GET /api/sites/:domain/runs/:runId", () => {
  const userId = "api-run-detail-user-1";
  const siteId = "api-run-detail-site-1";
  const runId = "api-run-detail-run-1";
  const userApiKey = `cite.me.in_${generateApiKey(16)}`;
  const domain = "api-run-detail-test.example";

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: "api-run-detail@test.example",
        passwordHash: await hashPassword("password"),
        apiKey: userApiKey,
      },
      update: { apiKey: userApiKey },
    });
    await prisma.site.upsert({
      where: { id: siteId },
      create: { id: siteId, domain, ownerId: userId, apiKey: `site_${generateApiKey(16)}` },
      update: {},
    });
    await prisma.citationQueryRun.upsert({
      where: { id: runId },
      create: {
        id: runId,
        siteId,
        platform: "perplexity",
        model: "sonar",
        queries: {
          create: [{
            query: "shopping center vacancy rates",
            group: "retail",
            extraQueries: [],
            text: "Answer text",
            position: 1,
            citations: ["https://api-run-detail-test.example/report"],
          }],
        },
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.citationQueryRun.delete({ where: { id: runId } });
    await prisma.site.delete({ where: { id: siteId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await fetch(`${BASE}/api/sites/${domain}/runs/${runId}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown runId", async () => {
    const res = await fetch(`${BASE}/api/sites/${domain}/runs/nonexistent`, {
      headers: { Authorization: `Bearer ${userApiKey}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns run detail with queries and citations", async () => {
    const res = await fetch(`${BASE}/api/sites/${domain}/runs/${runId}`, {
      headers: { Authorization: `Bearer ${userApiKey}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(runId);
    expect(body.platform).toBe("perplexity");
    expect(Array.isArray(body.queries)).toBe(true);
    expect(body.queries[0].query).toBe("shopping center vacancy rates");
    expect(body.queries[0].citations).toContain("https://api-run-detail-test.example/report");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/routes/api.sites.runDetail.test.ts
```

**Step 3: Implement the route**

Create `app/routes/api.sites.$domain_.runs.$runId.ts`:

```ts
import { requireUserByApiKey } from "~/lib/api-auth.server";
import prisma from "~/lib/prisma.server";
import { requireSiteAccess } from "~/lib/sites.server";
import type { Route } from "./+types/api.sites.$domain_.runs.$runId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const authUser = await requireUserByApiKey(request);
  const site = await requireSiteAccess(params.domain, authUser.id);

  const run = await prisma.citationQueryRun.findFirst({
    where: { id: params.runId, siteId: site.id },
    select: {
      id: true,
      platform: true,
      model: true,
      createdAt: true,
      queries: {
        select: {
          id: true,
          query: true,
          group: true,
          position: true,
          citations: true,
        },
        orderBy: { query: "asc" },
      },
    },
  });

  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(run);
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/routes/api.sites.runDetail.test.ts
```

**Step 5: Commit**

```bash
git add app/routes/api.sites.$domain_.runs.$runId.ts test/routes/api.sites.runDetail.test.ts
git commit -m "feat: add GET /api/sites/:domain/runs/:runId endpoint"
```

---

### Task 9: Profile page — API key section (Task #15)

**Files:**
- Modify: `app/routes/profile/route.tsx`
- Create: `app/routes/profile/ProfileApiKeyForm.tsx`

**Step 1: Create the API key form component**

Create `app/routes/profile/ProfileApiKeyForm.tsx`:

```tsx
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import type { action } from "./route";

export default function ProfileApiKeyForm({ apiKey }: { apiKey: string | null }) {
  const fetcher = useFetcher<typeof action>();
  const key = fetcher.data && "apiKey" in fetcher.data ? fetcher.data.apiKey : apiKey;
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <fetcher.Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value="regenerateApiKey" />
      <div className="space-y-2">
        <label className="text-sm font-medium">API key</label>
        {key ? (
          <Input readOnly value={key} className="font-mono text-sm" />
        ) : (
          <p className="text-sm text-muted-foreground">No API key generated yet.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" variant="neutral">
        {key ? "Regenerate API key" : "Generate API key"}
      </Button>
    </fetcher.Form>
  );
}
```

**Step 2: Update the profile loader and action**

In `app/routes/profile/route.tsx`:

1. Add `apiKey` to loader return — change the `loader` to return `{ user }` where `user` includes `apiKey`:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user };
}
```

The `requireUser` return type includes `apiKey` from the updated Prisma model, so no change needed in the loader itself — but verify the `user` object returned includes `apiKey`.

2. In the `action`, add a branch for `intent === "regenerateApiKey"`:

```ts
const intent = form.get("intent")?.toString();
if (intent === "regenerateApiKey") return regenerateApiKey({ userId: user.id });
```

3. Add the helper function:

```ts
async function regenerateApiKey({ userId }: { userId: string }) {
  try {
    const { generateApiKey } = await import("random-password-toolkit");
    const apiKey = `cite.me.in_${generateApiKey(24)}`;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { apiKey },
    });
    return { apiKey: user.apiKey };
  } catch (error) {
    captureException(error);
    return { error: "Failed to generate API key" };
  }
}
```

4. Add the API key tab to the component — add a new `TabsTrigger` and `TabsContent`:

```tsx
<TabsTrigger value="apikey">API key</TabsTrigger>
// ...
<TabsContent value="apikey">
  <ProfileApiKeyForm apiKey={user.apiKey ?? null} />
</TabsContent>
```

5. Import `ProfileApiKeyForm` at the top.

**Step 3: Verify typechecks**

```bash
pnpm typecheck
```

**Step 4: Run all tests**

```bash
pnpm vitest run
```

Expected: all pass.

**Step 5: Commit**

```bash
git add app/routes/profile/route.tsx app/routes/profile/ProfileApiKeyForm.tsx
git commit -m "feat: add API key section to profile page"
```

---

## Final Verification

```bash
pnpm test
```

Expected: typecheck, vitest, and playwright all pass.
