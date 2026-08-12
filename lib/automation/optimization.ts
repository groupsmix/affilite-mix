import type { AffiliateLinkHealthRow } from "@/types/database";

export const OPTIMIZATION_ACTION_CAP = 5;
export const OPTIMIZATION_SAMPLE_FLOOR = 100;
export const OPTIMIZATION_DEAD_WEIGHT_CLICKS = 200;
export const OPTIMIZATION_EPC_MULTIPLIER = 1.5;
export const OPTIMIZATION_COOLDOWN_DAYS = 14;
export const OPTIMIZATION_EPC_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type OptimizationActionType =
  | "products.archive"
  | "products.update"
  | "products.update_affiliate_url";

export interface ProductPerformance {
  productId: string;
  siteId: string;
  categoryId: string | null;
  groupKey?: string | null;
  featured: boolean;
  active: boolean;
  clicks: number;
  commissions: number;
  epc: number;
  network: string;
}

export interface OptimizationCandidate {
  actionType: OptimizationActionType;
  productId: string;
  payload: Record<string, unknown>;
  reason: string;
}

export interface AffiliateLinkOption {
  url: string;
  network: string;
}

export interface NetworkPerformance {
  network: string;
  clicks: number;
  epc: number;
}

export function hasSampleFloor(clicks: number): boolean {
  return clicks >= OPTIMIZATION_SAMPLE_FLOOR;
}

export function isDeadWeight(clicks: number, commissions: number): boolean {
  return clicks >= OPTIMIZATION_DEAD_WEIGHT_CLICKS && commissions === 0;
}

export function isWinnerPromotion(winnerEpc: number, featuredEpc: number): boolean {
  return winnerEpc >= featuredEpc * OPTIMIZATION_EPC_MULTIPLIER;
}

export function isEpcFresh(updatedAt: string | null, now = Date.now()): boolean {
  return updatedAt !== null && now - new Date(updatedAt).getTime() <= OPTIMIZATION_EPC_MAX_AGE_MS;
}

export function deterministicOptimizationKey(
  runDate: string,
  productId: string,
  actionType: OptimizationActionType,
): string {
  return `optimize:${runDate}:${productId}:${actionType}`;
}

export function chooseNetworkSwitch(
  currentAffiliateUrl: string | null,
  links: AffiliateLinkOption[],
  performance: NetworkPerformance[],
  health: Pick<AffiliateLinkHealthRow, "url" | "classification">[],
): { url: string; reason: string } | null {
  if (!currentAffiliateUrl || links.length < 2) return null;
  const currentLink = links.find((link) => link.url === currentAffiliateUrl);
  if (!currentLink) return null;
  const currentHealth = health.find((row) => row.url === currentAffiliateUrl);
  const currentPerformance = performance.find((row) => row.network === currentLink.network);
  const currentIsUnhealthy =
    currentHealth?.classification === "broken" || currentHealth?.classification === "suspicious";
  if (currentIsUnhealthy) {
    const alternate = links.find((link) => link.network !== currentLink.network);
    if (alternate) {
      return {
        url: alternate.url,
        reason: `Current affiliate destination is ${currentHealth.classification}`,
      };
    }
  }
  const best = [...performance]
    .filter((row) => row.network !== currentLink.network && hasSampleFloor(row.clicks))
    .sort((a, b) => b.epc - a.epc)[0];
  if (!best) return null;
  const alternate = links.find((link) => link.network === best.network);
  if (!alternate) return null;
  if (currentPerformance && best.epc >= currentPerformance.epc * OPTIMIZATION_EPC_MULTIPLIER) {
    return {
      url: alternate.url,
      reason: `Network ${best.network} EPC is at least 1.5x current network EPC`,
    };
  }
  return null;
}

export function chooseCandidates(
  products: ProductPerformance[],
  networkSwitches: Map<string, { url: string; reason: string }>,
): OptimizationCandidate[] {
  const eligible = products.filter((product) => product.active && hasSampleFloor(product.clicks));
  const reservedProducts = new Set<string>();
  const units: OptimizationCandidate[][] = [];
  for (const product of eligible) {
    const switchProposal = networkSwitches.get(product.productId);
    if (switchProposal) {
      units.push([
        {
          actionType: "products.update_affiliate_url",
          productId: product.productId,
          payload: { product_id: product.productId, affiliate_url: switchProposal.url },
          reason: switchProposal.reason,
        },
      ]);
      reservedProducts.add(product.productId);
    }
  }

  const groups = new Map<string, ProductPerformance[]>();
  for (const product of eligible) {
    const key = product.groupKey ?? product.categoryId ?? `site:${product.siteId}`;
    const group = groups.get(key) ?? [];
    const existing = group.find((candidate) => candidate.productId === product.productId);
    if (!existing || product.epc > existing.epc) {
      if (existing) group[group.indexOf(existing)] = product;
      else group.push(product);
    }
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const featured = group.find((product) => product.featured);
    if (!featured) continue;
    const winner = [...group].sort((a, b) => b.epc - a.epc)[0];
    if (
      winner &&
      winner.productId !== featured.productId &&
      hasSampleFloor(featured.clicks) &&
      isWinnerPromotion(winner.epc, featured.epc)
    ) {
      if (!reservedProducts.has(winner.productId) && !reservedProducts.has(featured.productId)) {
        units.push([
          {
            actionType: "products.update",
            productId: winner.productId,
            payload: { product_id: winner.productId, updates: { featured: true } },
            reason: `EPC ${winner.epc} is at least 1.5x featured product EPC ${featured.epc}`,
          },
          {
            actionType: "products.update",
            productId: featured.productId,
            payload: { product_id: featured.productId, updates: { featured: false } },
            reason: "Demoted after a competing product qualified for promotion",
          },
        ]);
        reservedProducts.add(winner.productId);
        reservedProducts.add(featured.productId);
      }
    }
  }

  for (const product of eligible) {
    if (
      !reservedProducts.has(product.productId) &&
      isDeadWeight(product.clicks, product.commissions)
    ) {
      units.push([
        {
          actionType: "products.archive",
          productId: product.productId,
          payload: { product_id: product.productId },
          reason: "At least 200 clicks in 30 days with zero commissions",
        },
      ]);
      reservedProducts.add(product.productId);
    }
  }
  const candidates: OptimizationCandidate[] = [];
  for (const unit of units) {
    if (candidates.length + unit.length > OPTIMIZATION_ACTION_CAP) continue;
    candidates.push(...unit);
  }
  return candidates;
}
