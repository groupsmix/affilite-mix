/**
 * CJ Affiliate API client.
 *
 * Uses the v2 Link Search REST API to discover affiliate links for a given
 * keyword / product name and returns a tracked deep link. Results are parsed
 * from CJ's XML response (the v2 endpoint returns XML by default) with a
 * JSON fallback in case CJ ever flips the Content-Type.
 *
 * Env:
 *   CJ_API_KEY       - Personal Access Token from CJ Developer Portal
 *   CJ_PUBLISHER_ID  - CJ website / publisher ID (PID)
 *
 * Docs:
 *   https://lab-developers.d.cjpowered.com/docs/rest-apis/link-search
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

const LINK_SEARCH_URL = "https://link-search.api.cj.com/v2/link-search";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface CjClientConfig {
  apiKey: string;
  publisherId: string;
}

export interface CjSearchOptions {
  keywords: string;
  advertiserIds?: string[];
  linkType?: string;
  recordsPerPage?: number;
  pageNumber?: number;
}

export interface CjLink {
  advertiserId: string;
  advertiserName: string;
  title: string;
  description: string;
  category: string;
  linkType: string;
  relationshipStatus: string;
  clickUrl: string;
  destinationUrl: string;
}

function getEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}

export function getCjConfig(): CjClientConfig | null {
  const apiKey = getEnv("CJ_API_KEY")?.trim();
  const publisherId = getEnv("CJ_PUBLISHER_ID")?.trim();
  if (!apiKey || !publisherId) return null;
  return { apiKey, publisherId };
}

export function isCjConfigured(): boolean {
  return getCjConfig() !== null;
}

function decodeXmlValue(raw: string): string {
  const trimmed = raw.trim();
  const cdata = trimmed.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata && cdata[1] !== undefined) {
    return cdata[1].trim();
  }
  // Decode named and numeric entities first, then &amp; last. This prevents
  // double-unescaping: an input like &amp;quot; must stay as &quot; rather
  // than becoming a quote.
  return trimmed
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractHref(html: string | undefined): string | null {
  if (!html) return null;
  const match = html.match(/<a\b[^>]*\bhref=["']([^"']+)["']/i);
  return match?.[1]?.trim() ?? null;
}

function parseLinkBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Matches <field-name>...value...</field-name> including CDATA / entities.
  const tagRe = /<([\w-]+)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) {
    const name = m[1]!.toLowerCase();
    const value = decodeXmlValue(m[2]!);
    fields[name] = value;
  }
  return fields;
}

function parseCjLinkSearchXml(xml: string): unknown[] {
  const links: unknown[] = [];
  const linkRe = /<link\b[^>]*>([\s\S]*?)<\/link>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(xml)) !== null) {
    const fields = parseLinkBlock(m[1]!);
    links.push(fields);
  }
  return links;
}

function stringField(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = raw[key];
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === "string") as string | undefined;
      if (first) return first;
    }
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function normalizeLink(raw: Record<string, unknown>): CjLink | null {
  const linkCodeHtml = stringField(raw, "link-code-html", "linkCodeHTML", "linkCodeHtml") ?? "";
  const clickUrl =
    extractHref(linkCodeHtml) ??
    stringField(raw, "click-url", "clickUrl") ??
    stringField(raw, "destination", "destination-url", "destinationUrl") ??
    "";
  const destinationUrl =
    stringField(raw, "destination", "destination-url", "destinationUrl") ?? clickUrl;

  if (!clickUrl && !destinationUrl) return null;

  return {
    advertiserId: stringField(raw, "advertiser-id", "advertiserId") ?? "",
    advertiserName: stringField(raw, "advertiser-name", "advertiserName") ?? "",
    title: stringField(raw, "link-name", "linkName", "cardName", "title") ?? "",
    description: stringField(raw, "description") ?? "",
    category: stringField(raw, "category") ?? "",
    linkType: stringField(raw, "link-type", "linkType") ?? "",
    relationshipStatus: stringField(raw, "relationship-status", "relationshipStatus") ?? "",
    clickUrl,
    destinationUrl,
  };
}

function parseResponseBody(text: string, contentType: string | null): CjLink[] {
  let rawLinks: unknown[] = [];
  const isXml = (contentType?.includes("xml") ?? false) || /^\s*</.test(text);

  if (isXml) {
    const blocks = parseCjLinkSearchXml(text);
    rawLinks = blocks;
  } else {
    try {
      const data = JSON.parse(text) as Record<string, unknown> | unknown[];
      if (Array.isArray(data)) {
        rawLinks = data;
      } else if (Array.isArray(data.links)) {
        rawLinks = data.links;
      } else if (Array.isArray(data.link)) {
        rawLinks = data.link;
      }
    } catch {
      logger.warn("CJ Link Search response was neither XML nor valid JSON");
      return [];
    }
  }

  return rawLinks
    .map((item) =>
      typeof item === "object" && item !== null
        ? normalizeLink(item as Record<string, unknown>)
        : null,
    )
    .filter((link): link is CjLink => link !== null && !!(link.clickUrl || link.destinationUrl));
}

export async function searchCjLinks({
  keywords,
  advertiserIds,
  linkType,
  recordsPerPage = 20,
  pageNumber = 1,
}: CjSearchOptions): Promise<CjLink[]> {
  const config = getCjConfig();
  if (!config) return [];

  const params = new URLSearchParams();
  params.set("website-id", config.publisherId);
  params.set("records-per-page", String(Math.min(Math.max(recordsPerPage, 1), 1000)));
  params.set("page-number", String(Math.max(pageNumber, 1)));
  if (keywords.trim()) params.set("keywords", keywords.trim());
  if (advertiserIds?.length) params.set("advertiser-ids", advertiserIds.join(","));
  if (linkType?.trim()) params.set("link-type", linkType.trim());

  const url = `${LINK_SEARCH_URL}?${params.toString()}`;
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json, application/xml;q=0.9, */*;q=0.8",
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  const text = await response.text();

  if (!response.ok) {
    const err = new Error(`CJ Link Search failed: ${response.status} ${response.statusText}`);
    captureException(err, { status: response.status, bodyPreview: text.slice(0, 500) });
    return [];
  }

  return parseResponseBody(text, response.headers.get("content-type"));
}

function linkScore(link: CjLink, keywords: string): number {
  const lowerKw = keywords.toLowerCase();
  const title = link.title.toLowerCase();
  const desc = link.description.toLowerCase();
  const joined = link.relationshipStatus.toLowerCase() === "joined";
  const textLink = link.linkType.toLowerCase().includes("text");

  let score = 0;
  if (joined) score += 50;
  if (textLink) score += 20;
  if (title === lowerKw) score += 100;
  else if (title.includes(lowerKw)) score += 40;
  else if (desc.includes(lowerKw)) score += 10;
  return score;
}

export async function findBestCjLink(
  keywords: string,
  advertiserIds?: string[],
): Promise<CjLink | null> {
  const links = await searchCjLinks({ keywords, advertiserIds, recordsPerPage: 50 });
  if (links.length === 0) return null;

  const sorted = [...links].sort((a, b) => linkScore(b, keywords) - linkScore(a, keywords));
  return sorted[0] ?? null;
}

export async function findCjDeepLink(
  keywords: string,
  advertiserIds?: string[],
): Promise<string | null> {
  const link = await findBestCjLink(keywords, advertiserIds);
  if (!link) return null;
  return link.clickUrl || link.destinationUrl || null;
}
