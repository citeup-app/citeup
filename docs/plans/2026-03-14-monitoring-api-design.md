# Monitoring API Design

**Date:** 2026-03-14
**Status:** Approved

## Overview

A REST API for monitoring cite.me.in data. Serves two audiences:

1. **Admin** — internal use by the app owner, to watch new users and sites
2. **Users** — public API for customers to pull their own citation data programmatically

## Endpoints

### Admin (`Authorization: Bearer $ADMIN_API_SECRET`)

```
GET /api/admin/users
```

Returns all users and their sites.

### User (`Authorization: Bearer <userApiKey>`)

```
GET /api/me
GET /api/sites/:domain
GET /api/sites/:domain/runs
GET /api/sites/:domain/runs/:runId
```

`/api/sites/*` endpoints accept a `?since=<ISO date>` query param on `/runs` for incremental monitoring.

## Authentication

**Admin routes** check the `Authorization: Bearer` token against the `ADMIN_API_SECRET` environment variable. No user context needed.

**User routes** check the `Authorization: Bearer` token against a new `apiKey` field on the `User` model. The key is generated on demand via the profile page and can be regenerated at any time.

For `/api/sites/:domain` and its children, access is enforced via the existing `requireSiteAccess(domain, userId)` helper — owner or member. Accessing a site the user doesn't belong to returns 404.

## Response Shapes

```jsonc
// GET /api/admin/users
{
  "users": [
    { "id", "email", "createdAt", "sites": [{ "domain", "createdAt" }] }
  ]
}

// GET /api/me
{ "id", "email", "createdAt", "sites": [{ "domain", "createdAt" }] }

// GET /api/sites/:domain
{
  "domain", "createdAt",
  "users": [{ "id", "email", "role": "owner" | "member" }]
}

// GET /api/sites/:domain/runs
{
  "runs": [{ "id", "platform", "model", "createdAt", "queryCount", "citationCount" }]
}

// GET /api/sites/:domain/runs/:runId
{
  "id", "platform", "model", "createdAt",
  "queries": [{ "id", "query", "group", "position", "citations": ["https://..."] }]
}
```

All errors return `{ "error": "<message>" }` with an appropriate HTTP status code.

## Schema Change

Add to the `User` model in `prisma/schema.prisma`:

```prisma
apiKey String? @unique @map("api_key")
```

Generated on demand; regeneratable via profile page.

## New Files

| File | Purpose |
|------|---------|
| `app/lib/api-auth.server.ts` | `requireAdminApiKey(request)` and `requireUserByApiKey(request)` helpers |
| `app/routes/api.admin.users.ts` | `GET /api/admin/users` |
| `app/routes/api.me.ts` | `GET /api/me` |
| `app/routes/api.sites.$domain.ts` | `GET /api/sites/:domain` |
| `app/routes/api.sites.$domain_.runs.ts` | `GET /api/sites/:domain/runs` |
| `app/routes/api.sites.$domain_.runs.$runId.ts` | `GET /api/sites/:domain/runs/:runId` |

## Profile Page Change

Add an "API key" section to the profile page:
- Shows the key (masked by default)
- Copy button
- Generate / Regenerate button (POST action)
