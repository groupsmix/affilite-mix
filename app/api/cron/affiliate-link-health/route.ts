import { NextRequest, NextResponse } from "next/server";
import { getPrivilegedDalClient } from "@/lib/dal/dal-client";
import {
  getAffiliateLinkHealth,
  getAffiliateLinkHealthCursor,
  setAffiliateLinkHealthCursor,
  upsertAffiliateLinkHealth,
  type LinkHealthClassification,
} from "@/lib/dal/affiliate-link-health";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { safeFetchWithRedirectMetadata, type SafeFetchRedirectResult } from "@/lib/ssrf-guard";
import { getNetworkFromUrl } from "@/lib/affiliate/networks";
import { extractRegistrableDomain } from "@/lib/affiliate-domain-allowlist";
import { captureException } from "@/lib/sentry";
import {
  classifyProbe,
  nextHealthCursor,
  sendAlerts,
  shouldAlert,
  HEALTH_TARGET_BATCH_SIZE,
} from "@/lib/affiliate-link-health-monitor";

const PRODUCT_PAGE_SIZE = 100;
const PROBE_TIMEOUT_MS = 3_000;

type Product = { id: string; site_id: string; name: string; affiliate_url: string | null };
type AffiliateLink = {
  id: string;
  product_id: string;
  network: string;
  url: string;
  is_active: boolean;
};
type ProbeTarget = {
  key: string;
  product: Product;
  linkId: string | null;
  network: string;
  url: string;
};
type ProbeResult = {
  classification: LinkHealthClassification;
  status: number | null;
  finalUrl: string | null;
  latencyMs: number | null;
  error: string | null;
};

function targetKey(productId: string, linkId: string | null): string {
  return linkId === null ? `${productId}:primary` : `${productId}:link:${linkId}`;
}

async function fetchProbe(url: string, method: "HEAD" | "GET"): Promise<SafeFetchRedirectResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await safeFetchWithRedirectMetadata(url, {
      method,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "AffiliteMix-LinkHealth/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeTarget(target: ProbeTarget): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    let probe = await fetchProbe(target.url, "HEAD");
    if ([403, 405, 501].includes(probe.response.status))
      probe = await fetchProbe(target.url, "GET");
    const response = probe.response;
    const finalUrl = probe.finalUrl;
    return {
      classification: classifyProbe(
        target.url,
        { status: response.status, finalUrl },
        target.network,
      ),
      status: response.status,
      finalUrl,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      classification: "broken",
      status: null,
      finalUrl: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < values.length) {
      const index = next++;
      results[index] = await callback(values[index]!);
    }
  }
  await Promise.all(new Array(Math.min(concurrency, values.length)).fill(undefined).map(worker));
  return results;
}

async function listTargets(
  cursor: string | null,
): Promise<{ targets: ProbeTarget[]; hasMoreProducts: boolean }> {
  const sb = getPrivilegedDalClient();
  let productQuery = sb
    // eslint-disable-next-line no-restricted-syntax -- privileged cron sweep is authenticated and site-scopes every persisted health row
    .from("products")
    .select("id, site_id, name, affiliate_url")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(PRODUCT_PAGE_SIZE);
  const cursorProductId = cursor?.split(":")[0] ?? null;
  if (cursorProductId) productQuery = productQuery.gte("id", cursorProductId);
  const { data: rawProducts, error: productError } = await productQuery;
  if (productError) throw productError;
  const products = (rawProducts ?? []) as Product[];
  if (products.length === 0) return { targets: [], hasMoreProducts: false };

  const { data: rawLinks, error: linkError } = await sb
    // eslint-disable-next-line no-restricted-syntax -- privileged cron sweep is authenticated and links are constrained to the selected products
    .from("product_affiliate_links")
    .select("id, product_id, network, url, is_active")
    .in(
      "product_id",
      products.map((product) => product.id),
    )
    .eq("is_active", true);
  if (linkError) throw linkError;
  const links = (rawLinks ?? []) as AffiliateLink[];
  const productById = new Map(products.map((product) => [product.id, product]));
  const targets: ProbeTarget[] = [];
  for (const product of products) {
    if (product.affiliate_url?.trim()) {
      targets.push({
        key: targetKey(product.id, null),
        product,
        linkId: null,
        network: getNetworkFromUrl(product.affiliate_url)?.toString() ?? "direct",
        url: product.affiliate_url,
      });
    }
    for (const link of links.filter((candidate) => candidate.product_id === product.id)) {
      if (!link.url.trim()) continue;
      targets.push({
        key: targetKey(product.id, link.id),
        product,
        linkId: link.id,
        network: link.network || getNetworkFromUrl(link.url)?.toString() || "direct",
        url: link.url,
      });
    }
  }
  targets.sort((a, b) => a.key.localeCompare(b.key));
  return {
    targets: targets
      .filter((target) => !cursor || target.key > cursor)
      .slice(0, HEALTH_TARGET_BATCH_SIZE),
    hasMoreProducts: products.length === PRODUCT_PAGE_SIZE,
  };
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/affiliate-link-health"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const cursor = await getAffiliateLinkHealthCursor();
    const { targets, hasMoreProducts } = await listTargets(cursor);
    const results = await mapWithConcurrency(targets, 8, probeTarget);
    const alerts: Array<{ target: ProbeTarget; result: ProbeResult; streak: number }> = [];
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      const result = results[index]!;
      const previous = await getAffiliateLinkHealth(
        target.product.site_id,
        target.product.id,
        target.url,
        target.linkId,
      );
      const classification = classifyProbe(
        target.url,
        { status: result.status, finalUrl: result.finalUrl, error: result.error },
        target.network,
        previous?.baseline_registrable_domain ?? null,
      );
      result.classification = classification;
      const failures =
        result.classification === "broken" ? (previous?.consecutive_failures ?? 0) + 1 : 0;
      const failureStarted =
        failures > 0 ? (previous?.failure_streak_started_at ?? new Date().toISOString()) : null;
      const baselineDomain =
        previous?.baseline_registrable_domain ??
        (result.finalUrl && result.classification !== "broken"
          ? extractRegistrableDomain(new URL(result.finalUrl).hostname)
          : null);
      await upsertAffiliateLinkHealth({
        site_id: target.product.site_id,
        product_id: target.product.id,
        product_affiliate_link_id: target.linkId,
        url: target.url,
        network: target.network,
        last_probed_at: new Date().toISOString(),
        last_http_status: result.status,
        final_url: result.finalUrl,
        baseline_registrable_domain: baselineDomain,
        latency_ms: result.latencyMs,
        consecutive_failures: failures,
        failure_streak_started_at: failureStarted,
        classification: result.classification,
      });
      if (shouldAlert(previous, result.classification, failures)) {
        alerts.push({ target, result, streak: failures });
      }
    }
    const lastKey = targets.at(-1)?.key ?? cursor;
    const nextCursor = nextHealthCursor(cursor, lastKey, targets.length, hasMoreProducts);
    await setAffiliateLinkHealthCursor(nextCursor);
    await sendAlerts(alerts);
    void recordCronLiveness("affiliate-link-health");
    return NextResponse.json({
      probed: targets.length,
      alerts: alerts.length,
      cursor: nextCursor,
    });
  } catch (error) {
    captureException(error, { context: "[cron/affiliate-link-health] failed" });
    return NextResponse.json({ error: "Affiliate link health probe failed" }, { status: 500 });
  }
}
