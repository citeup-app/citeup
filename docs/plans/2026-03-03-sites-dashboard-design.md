# Sites Dashboard Design

**Date:** 2026-03-03
**Feature:** Enhanced sites dashboard with metrics and delete functionality

## Overview

The sites dashboard displays all configured sites for a user in a single table. Each site shows key metrics from the last 14 days: citation count, average citation score, bot visits, and unique bots. Users can navigate to the citations page or delete a site.

## Requirements

- Show all sites in a single table within a Card component
- Display metrics filtered to last 14 days:
  - **Total citations**: Count of times the site was mentioned in LLM responses
  - **Average score**: Position-based scoring (top citation = 50 pts, others = 10 pts each)
  - **Bot visits**: Total count of bot visits to the site
  - **Unique bots**: Count of distinct bot types
- Column order: Domain | Citations | Avg Score | Bot Visits | Unique Bots | Actions
- Actions: "View" button (links to citations page), "Delete" button
- Delete requires confirmation with domain name match validation

## Architecture

### Data Fetching Strategy

**Bot metrics (database-calculated):**
- Use Prisma aggregations for efficiency
- Sum `BotVisit.count` for total visits (filtered to last 14 days)
- Count distinct `botType` values for unique bots (filtered to last 14 days)

**Citation metrics (code-calculated):**
- Fetch `CitationQueryRun` with related `CitationQuery` records
- Filter records where site URL appears in `CitationQuery.citations[]` array
- Filter to last 14 days
- Calculate score: position 0 = 50 points, all others = 10 points each
- Average = total score / citation count

### Loader (site/routes/sites/route.tsx)

```typescript
interface SiteMetrics {
  site: Site
  totalCitations: number
  avgScore: number
  totalBotVisits: number
  uniqueBots: number
}

loader(): Promise<{ sites: SiteMetrics[] }>
```

For each site, the loader:
1. Queries `BotVisit` aggregate to calculate bot metrics
2. Queries `CitationQueryRun` with `CitationQuery` relations
3. Filters and calculates citation metrics in TypeScript
4. Returns array of `SiteMetrics` objects

### Component Structure

**SitesPage component:**
- Renders empty state or table based on site count
- Single Card wrapping the table
- Table with rows for each site

**Delete Dialog:**
- Modal dialog triggered by delete button
- Text input to confirm domain name
- Submit button disabled until input matches site domain
- Calls delete action on form submit

### Delete Action

Path: `POST /sites` (or use useFetcher)

1. Extract site ID from request
2. Fetch site to verify ownership
3. Validate user-provided domain name matches
4. If mismatch: return `{ ok: false, error: "Domain doesn't match" }`
5. If match: delete site (cascades all related data via Prisma)
6. Return redirect to `/sites`

## Testing

Existing test file: `test/routes/sites.test.ts`

Tests to add/update:
- Sites dashboard with metrics displays correctly
- Delete confirmation requires correct domain
- Delete action deletes the site and redirects
- Metrics calculation is accurate for various citation/bot visit scenarios

## Files to Modify

- `app/routes/sites/route.tsx` - Update loader and component, add delete action
- `test/routes/sites.test.ts` - Update/add tests for metrics display and delete functionality

## Non-Breaking Changes

- Current "View Site" button functionality remains unchanged
- Empty state remains unchanged
- "Add Site" button remains unchanged
