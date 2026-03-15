# OpenAPI Spec Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add a Zod-first OpenAPI 3.1 spec for the user-facing monitoring API, with runtime response filtering via `.parse()`.

**Architecture:** Define central Zod schemas in `app/lib/api-schemas.ts`, call `.parse()` in each loader to strip unknown fields, register routes + schemas in `app/lib/openapi.ts` to generate the spec, and serve it at `GET /api/openapi.json`.

**Tech Stack:** `@asteasolutions/zod-to-openapi`, Zod (already in use), React Router 7 loaders

---

### Task 1: Install `@asteasolutions/zod-to-openapi`

**Files:**
- Modify: `package.json` (via pnpm)

**Step 1: Install the package**

```bash
pnpm add @asteasolutions/zod-to-openapi
```

Expected: package added to `dependencies` in `package.json`.

**Step 2: Verify it imports cleanly**

```bash
node -e "import('@asteasolutions/zod-to-openapi').then(m => console.log(Object.keys(m)))"
```

Expected: prints `[ 'extendZodWithOpenApi', 'OpenAPIRegistry', 'OpenApiGeneratorV31', ... ]`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @asteasolutions/zod-to-openapi"
```

---

### Task 2: Create Zod response schemas

**Files:**
- Create: `app/lib/api-schemas.ts`

The schemas cover exactly the fields each route returns. `z.date()` is correct here — Prisma returns `Date` objects, Zod validates them, and `Response.json()` serializes them to ISO strings. `@asteasolutions/zod-to-openapi` maps `z.date()` → `{ type: "string", format: "date-time" }` in the spec.

**Step 1: Create the file**

```ts
// app/lib/api-schemas.ts
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const SiteUserSchema = z
  .object({
    id: z.string().openapi({ example: "clxyz123" }),
    email: z.string().email().openapi({ example: "user@example.com" }),
    role: z.enum(["owner", "member"]).openapi({ example: "owner" }),
  })
  .openapi("SiteUser");

export const SiteSchema = z
  .object({
    domain: z.string().openapi({ example: "example.com" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    users: z.array(SiteUserSchema),
  })
  .openapi("Site");

export const RunSummarySchema = z
  .object({
    id: z.string().openapi({ example: "clxyz456" }),
    platform: z.string().openapi({ example: "chatgpt" }),
    model: z.string().openapi({ example: "gpt-4o" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    queryCount: z.number().int().openapi({ example: 5 }),
    citationCount: z.number().int().openapi({ example: 12 }),
  })
  .openapi("RunSummary");

export const RunsSchema = z
  .object({ runs: z.array(RunSummarySchema) })
  .openapi("Runs");

export const QuerySchema = z
  .object({
    id: z.string().openapi({ example: "clxyz789" }),
    query: z.string().openapi({ example: "best retail platforms" }),
    group: z.string().openapi({ example: "retail" }),
    position: z.number().int().nullable().openapi({ example: 1 }),
    citations: z
      .array(z.string())
      .openapi({ example: ["https://example.com/page1"] }),
  })
  .openapi("Query");

export const RunDetailSchema = z
  .object({
    id: z.string().openapi({ example: "clxyz456" }),
    platform: z.string().openapi({ example: "chatgpt" }),
    model: z.string().openapi({ example: "gpt-4o" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    queries: z.array(QuerySchema),
  })
  .openapi("RunDetail");
```

**Step 2: Verify typechecks**

```bash
pnpm typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/lib/api-schemas.ts
git commit -m "feat: add Zod response schemas for monitoring API"
```

---

### Task 3: Create the OpenAPI spec builder

**Files:**
- Create: `app/lib/openapi.ts`

**Step 1: Create the file**

```ts
// app/lib/openapi.ts
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  RunDetailSchema,
  RunsSchema,
  SiteSchema,
} from "~/lib/api-schemas";

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Per-user API key from your profile page",
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}",
  summary: "Get site details",
  description: "Returns site metadata and the list of users with access.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
    }),
  },
  responses: {
    200: {
      description: "Site details with users",
      content: { "application/json": { schema: SiteSchema } },
    },
    401: { description: "Unauthorized — missing or invalid API key" },
    403: { description: "Forbidden — API key does not have access to this site" },
    404: { description: "Site not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}/runs",
  summary: "List citation runs",
  description: "Returns all citation runs for a site, newest first. Use `?since=<ISO date>` to filter.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
    }),
    query: z.object({
      since: z
        .string()
        .datetime()
        .optional()
        .openapi({ example: "2024-01-01T00:00:00.000Z", description: "Return only runs created after this ISO 8601 timestamp" }),
    }),
  },
  responses: {
    200: {
      description: "List of citation runs",
      content: { "application/json": { schema: RunsSchema } },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
    404: { description: "Site not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}/runs/{runId}",
  summary: "Get run detail",
  description: "Returns a single citation run with all queries and citations.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
      runId: z.string().openapi({ example: "clxyz456" }),
    }),
  },
  responses: {
    200: {
      description: "Run detail with queries and citations",
      content: { "application/json": { schema: RunDetailSchema } },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
    404: { description: "Run not found" },
  },
});

export function generateOpenApiSpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Cite.me.in Monitoring API",
      version: "1.0.0",
      description:
        "Monitor your brand's visibility in AI-generated responses. Authenticate with your API key from the profile page.",
    },
    servers: [{ url: "https://cite.me.in" }],
  });
}
```

**Step 2: Verify typechecks**

```bash
pnpm typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/lib/openapi.ts
git commit -m "feat: add OpenAPI spec builder"
```

---

### Task 4: Serve the spec at `GET /api/openapi.json`

**Files:**
- Create: `app/routes/api.openapi.ts`
- Create: `test/routes/api.openapi.test.ts`

**Step 1: Write the failing test**

```ts
// test/routes/api.openapi.test.ts
import { describe, expect, it } from "vitest";
import { port } from "~/test/helpers/launchBrowser";

const BASE = `http://localhost:${port}`;

describe("GET /api/openapi.json", () => {
  it("returns 200 with a valid OpenAPI 3.1 document", async () => {
    const res = await fetch(`${BASE}/api/openapi.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("Cite.me.in Monitoring API");
    expect(body.paths).toHaveProperty("/api/sites/{domain}");
    expect(body.paths).toHaveProperty("/api/sites/{domain}/runs");
    expect(body.paths).toHaveProperty("/api/sites/{domain}/runs/{runId}");
  });

  it("documents BearerAuth security scheme", async () => {
    const res = await fetch(`${BASE}/api/openapi.json`);
    const body = await res.json();
    expect(body.components.securitySchemes.BearerAuth).toBeDefined();
    expect(body.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
CHOKIDAR_USEPOLLING=1 pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/api.openapi.test.ts
```

Expected: FAIL — 404 (route doesn't exist yet)

**Step 3: Create the route**

```ts
// app/routes/api.openapi.ts
import { generateOpenApiSpec } from "~/lib/openapi";

export async function loader() {
  return Response.json(generateOpenApiSpec());
}
```

**Step 4: Run test to verify it passes**

```bash
CHOKIDAR_USEPOLLING=1 pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/api.openapi.test.ts
```

Expected: PASS — 2 tests passing

**Step 5: Commit**

```bash
git add app/routes/api.openapi.ts test/routes/api.openapi.test.ts
git commit -m "feat: serve OpenAPI spec at GET /api/openapi.json"
```

---

### Task 5: Add `.parse()` to route loaders

**Files:**
- Modify: `app/routes/api.sites.$domain.ts`
- Modify: `app/routes/api.sites.$domain_.runs.ts`
- Modify: `app/routes/api.sites.$domain_.runs.$runId.ts`

**Step 1: Update `api.sites.$domain.ts`**

```ts
// app/routes/api.sites.$domain.ts
import { SiteSchema } from "~/lib/api-schemas";
import { verifySiteAccess } from "~/lib/apiAuth.server";
import type { Route } from "./+types/api.sites.$domain";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

  return Response.json(
    SiteSchema.parse({
      domain: site.domain,
      createdAt: site.createdAt,
      users: [
        { id: site.owner.id, email: site.owner.email, role: "owner" },
        ...site.siteUsers.map(({ user }) => ({
          id: user.id,
          email: user.email,
          role: "member",
        })),
      ],
    }),
  );
}
```

**Step 2: Update `api.sites.$domain_.runs.ts`**

```ts
// app/routes/api.sites.$domain_.runs.ts
import { RunsSchema } from "~/lib/api-schemas";
import { verifySiteAccess } from "~/lib/apiAuth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain_.runs";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

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

  return Response.json(
    RunsSchema.parse({
      runs: runs.map(({ queries, ...run }) => ({
        ...run,
        queryCount: queries.length,
        citationCount: queries.reduce((sum, q) => sum + q.citations.length, 0),
      })),
    }),
  );
}
```

**Step 3: Update `api.sites.$domain_.runs.$runId.ts`**

```ts
// app/routes/api.sites.$domain_.runs.$runId.ts
import { RunDetailSchema } from "~/lib/api-schemas";
import { verifySiteAccess } from "~/lib/apiAuth.server";
import prisma from "~/lib/prisma.server";
import type { Route } from "./+types/api.sites.$domain_.runs.$runId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const site = await verifySiteAccess({ domain: params.domain, request });

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

  if (!run) throw new Response("Not found", { status: 404 });
  return Response.json(RunDetailSchema.parse(run));
}
```

**Step 4: Run existing api.sites tests to confirm nothing broke**

```bash
CHOKIDAR_USEPOLLING=1 pnpm --expose-gc --max-old-space-size=3096 vitest run test/routes/api.sites.test.ts
```

Expected: 9 passing

**Step 5: Commit**

```bash
git add app/routes/api.sites.$domain.ts app/routes/api.sites.$domain_.runs.ts app/routes/api.sites.$domain_.runs.$runId.ts
git commit -m "feat: validate and filter API responses with Zod schemas"
```
