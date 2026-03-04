import dns from "node:dns";
import parseHTMLTree, { getBodyContent } from "~/lib/html/parseHTML";
import type { Account, Site } from "~/prisma";
import prisma from "./prisma.server";

/**
 * Add a site to an account. If the domain is not valid, already added, or
 * does not have DNS records, throws an error.
 *
 * @param account - The account to add the site to.
 * @param url - The URL of the site to add.
 * @throws {Error} If the domain is not valid, already added, or does not have DNS records.
 * @returns The added site.
 */
export async function addSiteToAccount(
  account: Account,
  url: string,
): Promise<Site> {
  const domain = extractDomain(url);
  if (!domain) throw new Error("Enter a valid website URL or domain name");

  const existing = await prisma.site.findFirst({
    where: { accountId: account.id, domain },
  });
  if (existing) throw new Error("That domain is already added to your account");

  const dnsOk = await verifyDomain(domain);
  if (!dnsOk)
    throw new Error(`No DNS records found for ${domain}. Is the domain live?`);

  const site = await prisma.site.create({
    data: { domain, account: { connect: { id: account.id } } },
  });
  return site;
}

/**
 * Extract the domain from a URL.
 *
 * @param url - The URL to extract the domain from.
 * @returns The domain, or null if the URL is not valid.
 */
export function extractDomain(url: string): string | null {
  try {
    const href = url.startsWith("http") ? url : `https://${url}`;
    const { hostname } = new URL(href);
    if (!hostname || hostname === "localhost") return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verify that a domain has DNS records.
 *
 * @param domain - The domain to verify.
 * @returns True if the domain has DNS records, false otherwise.
 */
export async function verifyDomain(domain: string): Promise<boolean> {
  try {
    await Promise.race([
      Promise.any([
        dns.promises.resolve(domain, "A"),
        dns.promises.resolve(domain, "CNAME"),
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5_000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch the page content for a given domain. If the page is not found or the
 * request times out, returns null. The content is limited to 5,000 characters.
 *
 * @param domain - The domain to fetch the page content for.
 * @returns The page content, or null if the page is not found or the request times out.
 */
export async function fetchPageContent(domain: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`https://${domain}/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const html = await response.text();
    const tree = parseHTMLTree(html);
    return getBodyContent(tree).slice(0, 5_000);
  } catch {
    return null;
  }
}
