import type { SiteDefinition } from "../site-definition";
import { arabicToolsSite } from "./arabic-tools";
import { cryptoToolsSite } from "./crypto-tools";
import { watchToolsSite } from "./watch-tools";

export { arabicToolsSite, cryptoToolsSite, watchToolsSite };

/** All registered sites. Add new sites here. */
export const allSites: SiteDefinition[] = [arabicToolsSite, cryptoToolsSite, watchToolsSite];

/** Lookup site by id */
export function getSiteById(id: string): SiteDefinition | undefined {
  return allSites.find((s) => s.id === id);
}

/** Lookup site by domain or alias */
export function getSiteByDomain(hostname: string): SiteDefinition | undefined {
  return allSites.find(
    (s) =>
      s.domain === hostname ||
      s.aliases?.includes(hostname),
  );
}
