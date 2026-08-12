import type { AffiliateLinkHealthRow } from "@/types/database";
import { extractRegistrableDomain } from "@/lib/affiliate-domain-allowlist";
import {
  getNetworkFromUrl,
  getTrackingParamForNetwork,
  toAffiliateNetwork,
  type AffiliateNetwork,
} from "@/lib/affiliate/networks";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { captureException, captureMessage } from "@/lib/sentry";
import { logger } from "@/lib/logger";

const FAILURE_ALERT_THRESHOLD = 3;
const MAX_EMAIL_ALERTS = 20;
export const HEALTH_TARGET_BATCH_SIZE = 32;
const PRODUCT_TARGET_PREFIX = "0:product:";
const DIAL_TARGET_PREFIX = "1:dial:";

export function normalizeHealthCursor(cursor: string | null): string | null {
  if (!cursor) return null;
  if (
    new RegExp(`^${PRODUCT_TARGET_PREFIX}[0-9a-f-]+:(primary|link:[^:]+)$`, "i").test(cursor) ||
    new RegExp(`^${DIAL_TARGET_PREFIX}[^:]+:[^:]+$`).test(cursor)
  ) {
    return cursor;
  }
  return null;
}

function trackingIdentityChanged(
  originalUrl: string,
  finalUrl: string,
  network: AffiliateNetwork | null,
) {
  if (!network) return false;
  const parameter = getTrackingParamForNetwork(network);
  if (!parameter) return false;
  try {
    const original = new URL(originalUrl).searchParams.get(parameter);
    const final = new URL(finalUrl).searchParams.get(parameter);
    return original !== null && final !== null && original !== final;
  } catch {
    return true;
  }
}

export function classifyProbe(
  originalUrl: string,
  result: { status: number | null; finalUrl: string | null; error?: string | null },
  network: string,
  baselineRegistrableDomain: string | null = null,
) {
  if (result.error || result.status === null || result.status >= 400) return "broken" as const;
  if (!result.finalUrl) return "broken" as const;
  const finalRegistrableDomain = extractRegistrableDomain(new URL(result.finalUrl).hostname);
  const affiliateNetwork = toAffiliateNetwork(network) ?? getNetworkFromUrl(originalUrl);
  if (
    (baselineRegistrableDomain !== null && finalRegistrableDomain !== baselineRegistrableDomain) ||
    trackingIdentityChanged(originalUrl, result.finalUrl, affiliateNetwork)
  ) {
    return "suspicious" as const;
  }
  return "healthy" as const;
}

export function shouldAlert(
  previous: Pick<AffiliateLinkHealthRow, "classification" | "consecutive_failures"> | null,
  classification: "healthy" | "broken" | "suspicious",
  consecutiveFailures: number,
) {
  if (classification === "suspicious") return previous?.classification !== "suspicious";
  return (
    classification === "broken" &&
    consecutiveFailures >= FAILURE_ALERT_THRESHOLD &&
    (previous?.classification !== "broken" ||
      (previous?.consecutive_failures ?? 0) < FAILURE_ALERT_THRESHOLD)
  );
}

export function nextHealthCursor(
  current: string | null,
  lastKey: string | null,
  targetCount: number,
  hasMoreProducts: boolean,
) {
  if (targetCount === 0 || (!hasMoreProducts && targetCount < HEALTH_TARGET_BATCH_SIZE))
    return null;
  return lastKey ?? current;
}

export async function sendAlerts(
  alerts: Array<{
    target: {
      product?: { name: string; [key: string]: unknown } | null;
      sourceName?: string;
      url: string;
      [key: string]: unknown;
    };
    result: { classification: string; status: number | null; [key: string]: unknown };
    streak: number;
  }>,
) {
  if (alerts.length === 0) return;
  const summary = alerts
    .slice(0, MAX_EMAIL_ALERTS)
    .map(
      ({ target, result, streak }) =>
        `${target.sourceName ?? target.product?.name ?? "Unknown destination"}: ${result.classification} (${target.url}; status=${result.status ?? "error"}; streak=${streak})`,
    )
    .join("\n");
  captureMessage(
    `Affiliate link health alert (${alerts.length} destination${alerts.length === 1 ? "" : "s"})`,
    "error",
  );
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM_EMAIL;
  const recipient = process.env.AFFILIATE_HEALTH_ALERT_EMAIL;
  if (!resendKey || !from || !recipient) return;
  try {
    await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `Affiliate link health: ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`,
        text: summary,
      }),
      timeoutMs: 8_000,
    });
  } catch (error) {
    captureException(error, { context: "[cron/affiliate-link-health] alert email failed" });
    logger.warn("[affiliate-link-health] alert email failed");
  }
}
