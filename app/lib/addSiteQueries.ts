import { uniqBy } from "es-toolkit";
import type { Site } from "~/prisma";
import queryAccount from "./llm-visibility/queryAccount";
import prisma from "./prisma.server";

/**
 * Add queries to a site. Only adds queries that are not already present,
 * removes duplicates, and does a citation query run on the new queries.
 *
 * @param site - The site to add queries to.
 * @param queries - The queries to add.
 * @returns The created queries.
 */
export default async function addSiteQueries(
  site: Site,
  queries: { group: string; query: string }[],
) {
  const notEmpty = queries
    .map(({ group, query }) => ({
      group: group.trim(),
      query: query.trim(),
    }))
    .filter((q) => q.group && q.query.trim());
  const unique = uniqBy(notEmpty, (q) => `${q.group}:${q.query}`);
  await prisma.siteQuery.createMany({
    data: unique.map(({ group, query }) => ({ siteId: site.id, group, query })),
  });
  await queryAccount({ site, queries: unique });
}

/**
 * Update a query for a site. Does a citation query run on the new query.
 *
 * @param id - The id of the query to update.
 * @param query - The new query.
 * @returns The updated query.
 */
export async function updateSiteQuery(id: string, query: string) {
  const updated = await prisma.siteQuery.update({
    data: { query: query.trim() },
    include: { site: true },
    where: { id },
  });
  await queryAccount({ queries: [updated], site: updated.site });
}
