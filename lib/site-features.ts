import { notFound } from "next/navigation";
import type { SiteDefinition, FeatureFlags } from "@/config/site-definition";
import { getCurrentSite } from "./site-context";

export function hasSiteFeature(site: SiteDefinition, feature: keyof FeatureFlags): boolean {
  const value = site.features[feature];
  return Boolean(value);
}

export async function requireSiteFeature(feature: keyof FeatureFlags): Promise<SiteDefinition> {
  const site = await getCurrentSite();
  if (!hasSiteFeature(site, feature)) {
    notFound();
  }
  return site;
}
