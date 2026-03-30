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
  // Direct match on domain or alias
  const direct = allSites.find(
    (s) =>
      s.domain === hostname ||
      s.aliases?.includes(hostname),
  );
  if (direct) return direct;

  // Development fallback: resolve localhost / *.localhost to a site
  if (process.env.NODE_ENV === "development") {
    // Check for <site>.localhost subdomains (e.g. watch.localhost)
    if (hostname.endsWith(".localhost")) {
      const prefix = hostname.replace(/\.localhost$/, "");
      const byAlias = allSites.find((s) =>
        s.aliases?.some((a) => a.startsWith(prefix + ".")),
      );
      if (byAlias) return byAlias;
    }

    // Fallback: use NEXT_PUBLIC_DEFAULT_SITE env var or the first registered site
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      const defaultSiteId = process.env.NEXT_PUBLIC_DEFAULT_SITE;
      if (defaultSiteId) {
        const byId = allSites.find((s) => s.id === defaultSiteId);
        if (byId) return byId;
      }
      return allSites[0];
    }
  }

  return undefined;
}
