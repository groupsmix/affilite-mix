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

export function chooseCandidates(
  products: ProductPerformance[],
  health: AffiliateLinkHealthRow[],
  alternateUrls: Map<string, string>,
): OptimizationCandidate[] {
  const candidates: OptimizationCandidate[] = [];
  const eligible = products.filter((product) => product.active && hasSampleFloor(product.clicks));

  const deadWeightProducts = new Set<string>();
  for (const product of eligible) {
    if (
      isDeadWeight(product.clicks, product.commissions) &&
      !deadWeightProducts.has(product.productId)
    ) {
      deadWeightProducts.add(product.productId);
      candidates.push({
        actionType: "products.archive",
        productId: product.productId,
        payload: { product_id: product.productId },
        reason: "At least 200 clicks in 30 days with zero commissions",
      });
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
      candidates.push({
        actionType: "products.update",
        productId: winner.productId,
        payload: { product_id: winner.productId, updates: { featured: true } },
        reason: `EPC ${winner.epc} is at least 1.5x featured product EPC ${featured.epc}`,
      });
      candidates.push({
        actionType: "products.update",
        productId: featured.productId,
        payload: { product_id: featured.productId, updates: { featured: false } },
        reason: "Demoted after a competing product qualified for promotion",
      });
    }
  }

  const healthByProduct = new Map(health.map((row) => [row.product_id, row]));
  for (const product of eligible) {
    const alternateUrl = alternateUrls.get(product.productId);
    const currentHealth = healthByProduct.get(product.productId);
    if (
      alternateUrl &&
      (currentHealth?.classification === "broken" || currentHealth?.classification === "suspicious")
    ) {
      candidates.push({
        actionType: "products.update_affiliate_url",
        productId: product.productId,
        payload: { product_id: product.productId, affiliate_url: alternateUrl },
        reason: `Current affiliate destination is ${currentHealth.classification}`,
      });
    }
  }
  return candidates.slice(0, OPTIMIZATION_ACTION_CAP);
}
