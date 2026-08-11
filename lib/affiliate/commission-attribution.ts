/**
 * Map ingested commission reports onto a site and, when the network echoed a
 * per-click reference, onto the click and product that produced the sale.
 *
 * See `lib/affiliate/click-attribution.ts` for the tracking-value contract.
 * Lookups are injected so the resolution rules can be exercised without a
 * database.
 */

import type { ResolvedClickAttribution } from "@/lib/dal/affiliate-clicks";
import { parseTrackingValue } from "@/lib/affiliate/click-attribution";

export interface AttributableReport {
  network: string;
  tracking_key: string;
  click_id?: string;
  product_id?: string;
}

export interface CommissionAttributionDeps {
  resolveSites(network: string, trackingKeys: string[]): Promise<Map<string, string>>;
  resolveClicks(clickRefs: string[]): Promise<Map<string, ResolvedClickAttribution>>;
}

export interface CommissionAttributionResult<TReport extends AttributableReport> {
  /** Reports that resolved to a site, with click/product filled in when known. */
  resolved: (TReport & { site_id: string })[];
  /** Reports whose tracking key matches no site and no click. */
  unresolved: TReport[];
}

export async function attributeCommissions<TReport extends AttributableReport>(
  reports: TReport[],
  deps: CommissionAttributionDeps,
): Promise<CommissionAttributionResult<TReport>> {
  const resolved: (TReport & { site_id: string })[] = [];
  const unresolved: TReport[] = [];
  if (reports.length === 0) return { resolved, unresolved };

  const reportsByNetwork = new Map<string, TReport[]>();
  for (const report of reports) {
    const networkReports = reportsByNetwork.get(report.network) ?? [];
    networkReports.push(report);
    reportsByNetwork.set(report.network, networkReports);
  }

  // Look up the reported value as-is — links published before this contract,
  // and networks that rewrite the value, still report a plain site key — as
  // well as the prefix left once a click reference is split off.
  const sitesByNetworkKey = new Map<string, string>();
  for (const [network, networkReports] of reportsByNetwork) {
    const keys: string[] = [];
    for (const report of networkReports) {
      keys.push(report.tracking_key);
      const parsed = parseTrackingValue(report.tracking_key);
      if (parsed.clickRef && parsed.trackingKey !== "") keys.push(parsed.trackingKey);
    }
    for (const [trackingKey, siteId] of await deps.resolveSites(network, keys)) {
      sitesByNetworkKey.set(`${network}\u0000${trackingKey}`, siteId);
    }
  }

  const clicksByRef = await deps.resolveClicks(
    reports
      .map((report) => parseTrackingValue(report.tracking_key).clickRef)
      .filter((ref): ref is string => ref !== null),
  );

  for (const report of reports) {
    const parsed = parseTrackingValue(report.tracking_key);
    const click = parsed.clickRef ? clicksByRef.get(parsed.clickRef) : undefined;
    const siteId =
      sitesByNetworkKey.get(`${report.network}\u0000${report.tracking_key}`) ??
      (parsed.clickRef
        ? sitesByNetworkKey.get(`${report.network}\u0000${parsed.trackingKey}`)
        : undefined) ??
      click?.site_id;

    if (!siteId) {
      unresolved.push(report);
      continue;
    }

    // A reference belonging to another site would mean the network echoed a
    // value we never minted for this key: keep the site-level attribution but
    // never carry a click across tenants.
    const attributable = click && click.site_id === siteId ? click : undefined;
    resolved.push({
      ...report,
      site_id: siteId,
      ...(attributable ? { click_id: report.click_id ?? attributable.click_id } : {}),
      ...(attributable?.product_id
        ? { product_id: report.product_id ?? attributable.product_id }
        : {}),
    });
  }

  return { resolved, unresolved };
}
