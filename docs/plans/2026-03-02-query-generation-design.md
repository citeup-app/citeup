# Query Generation Design

Auto-generate categorized LLM visibility queries from site content.

## Problem

After adding a site, users land on an empty queries page and must manually
create groups and queries from scratch. This friction slows onboarding and
leaves many accounts with no queries to run.

## Solution

When a site is added, generate a starter set of 9 queries (3 fixed categories
× 3 queries each) using Claude and the site's scraped content. Show the
suggestions for review before saving. Also expose a "Suggest queries" button
on the queries page for later use.

## Categories

Fixed across all sites:

| Group key | Intent |
|-----------|--------|
| `1.discovery` | User doesn't know the brand; looking for solutions in its space |
| `2.active_search` | User is actively looking for a specific product/service the site offers |
| `3.comparison` | User is comparing options; the site should appear as a credible choice |

## Generation function

**File:** `app/lib/llm-visibility/generateSiteQueries.ts`

- Calls Claude Haiku via `generateObject` from the `ai` SDK
- Input: `site.content` (up to 5000 chars, already stored on `Site`)
- Output: `{ group: string; query: string }[]` — 9 items
- Validated with a Zod schema; throws on malformed output
- Callers handle errors; this function does not swallow them

## Site creation flow

`sites_.new` action becomes two-phase:

**Phase 1 — first submit:**
1. Extract and verify domain (unchanged)
2. Fetch page content (unchanged)
3. Create `Site` record (unchanged)
4. Call `generateSiteQueries(content)`
5. Return `{ siteId, suggestions }` — page renders review UI

If content is null or generation fails: skip step 4, return `{ siteId }`,
redirect to `/site/${siteId}` (existing behaviour).

**Phase 2 — second submit (`intent="save-queries"`):**
1. Receive approved queries as form data
2. Bulk-insert into `SiteQuery`
3. Redirect to `/site/${siteId}`

**UI states:**
1. Entry form (current)
2. Loading — "Verifying domain and generating queries…"
3. Review — editable list grouped by category; delete per query; "Add query"
   per group; "Save queries" CTA; "Skip" link

## Queries page changes

- "Suggest queries" button added to page header
- Submits `intent="suggest"` to the existing queries action
- Action calls `generateSiteQueries(site.content)`, returns `{ ok: true, suggestions }`
- On success: collapsible suggestion panel grouped by category
- Each suggestion has an "Add" button — submits `intent="add-query"` (existing)
- Panel is ephemeral (action data only); re-trigger to regenerate
- Button hidden when `site.content` is null

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| LLM error during site creation | Skip generation; redirect to site page; log with `captureException` |
| LLM error on queries page | Return `{ ok: false, error }`, show inline message |
| `site.content` is null | Skip / hide button |
| User deletes all review suggestions | "Save queries" disabled; "Skip" still available |
| Duplicate suggestions added | No dedup — user manages manually |

## Testing

- Unit: `generateSiteQueries` with mocked `generateObject` — assert 9 items,
  3 groups, graceful malformed-output handling
- HTTP: `sites_.new` phase 1 with mocked LLM — assert `suggestions` in response
- HTTP: `sites_.new` phase 1 with LLM failure — assert `siteId` returned, no crash
- HTTP: `sites_.new` phase 2 — assert `SiteQuery` rows created
- HTTP: queries page `intent="suggest"` — assert suggestions returned
- HTTP: queries page `intent="suggest"` with null content — assert error

## Files changed

| File | Change |
|------|--------|
| `app/lib/llm-visibility/generateSiteQueries.ts` | New — generation function |
| `app/routes/sites_.new/route.tsx` | Two-phase action + review UI |
| `app/routes/site.$id_.queries/route.tsx` | Add `intent="suggest"` action branch |
| `app/routes/site.$id_.queries/SuggestedQueries.tsx` | New — suggestion panel component |
| `test/lib/generateSiteQueries.test.ts` | New — unit tests |
| `test/routes/sites_.new.test.ts` | New — HTTP integration tests |
| `test/routes/site.$id_.queries.test.ts` | New or extended — suggest action tests |
