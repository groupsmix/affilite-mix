export function getSiteContext(site: any, dbSiteId: string) {
  // Separate config site slug from database site UUID
  return {
    ...site,
    id: site.id,       // stable slug, e.g. "watch-tools"
    dbSiteId,          // database UUID
  };
}
