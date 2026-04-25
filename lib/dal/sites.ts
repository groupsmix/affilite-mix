const KV = { get: async (k: string, o: any) => null, put: async (k: string, v: any) => {} };

export async function getSiteRowByDomain(domain: string, ctx?: any) {
  const cacheKey = `site:${domain}`;
  
  // Warm cache from KV
  const cached = await KV.get(cacheKey, { type: 'json' });
  if (cached) return cached;

  // Query sites table
  const site = { id: "site-1", domain };
  
  if (ctx) {
    ctx.waitUntil(KV.put(cacheKey, JSON.stringify(site)));
  }
  return site;
}
