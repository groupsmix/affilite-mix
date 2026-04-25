/**
 * A/B Testing Framework (§3.3)
 *
 * Deterministic bucketing on (visitor_id, experiment_id).
 * No external dependencies — uses built-in crypto for hashing.
 */

export interface Variant {
  id: string;
  weight: number;
}

export interface Experiment {
  id: string;
  slug: string;
  variants: Variant[];
  status: "draft" | "running" | "paused" | "completed";
}

/**
 * Deterministic variant assignment using FNV-1a hash.
 * Same visitor + experiment always gets the same variant.
 * No network calls — pure function.
 */
export function assignVariant(
  visitorId: string,
  experimentId: string,
  variants: Variant[],
): string {
  if (variants.length === 0) return "control";
  if (variants.length === 1) return variants[0].id;

  const hash = fnv1aHash(`${visitorId}:${experimentId}`);
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  const bucket = hash % totalWeight;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant.id;
  }

  return variants[variants.length - 1].id;
}

/**
 * FNV-1a hash — fast, deterministic, good distribution.
 * Returns a positive 32-bit integer.
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned
}

/**
 * Get or assign a variant for a visitor in an experiment.
 * Checks for existing assignment first, creates one if needed.
 */
export async function getVariantAssignment(
  experimentId: string,
  visitorId: string,
  variants: Variant[],
  siteId: string,
): Promise<string> {
  const { getServiceClient } = await import("@/lib/supabase-server");
  const sb = getServiceClient();

  // Check existing assignment

  const { data: existing } = await (sb.from as any)("experiment_assignments")
    .select("variant_id")
    .eq("experiment_id", experimentId)
    .eq("visitor_id", visitorId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (existing) return existing.variant_id as string;

  // Assign deterministically
  const variantId = assignVariant(visitorId, experimentId, variants);

  // Persist assignment

  await (sb.from as any)("experiment_assignments")
    .insert({
      experiment_id: experimentId,
      visitor_id: visitorId,
      variant_id: variantId,
      site_id: siteId,
    })
    .select()
    .single();

  return variantId;
}

/**
 * Log an experiment event (view, click, conversion).
 */
export async function logExperimentEvent(input: {
  experiment_id: string;
  visitor_id: string;
  variant_id: string;
  site_id: string;
  event_type: "view" | "click" | "conversion";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { getServiceClient } = await import("@/lib/supabase-server");
  const sb = getServiceClient();

  await (sb.from as any)("experiment_events").insert(input).select().single();
}
