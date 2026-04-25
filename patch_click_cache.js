const fs = require('fs');

let clickRoute = fs.readFileSync('/data/user/work/affilite-mix/app/api/track/click/route.ts', 'utf8');

// We want to replace the product lookup logic
clickRoute = clickRoute.replace(
  '    // Validate product exists for this site\n    const product = await getProductBySlug(siteId, productSlug);\n    if (!product || !product.affiliate_url) {\n      return apiError(404, "Product not found or has no affiliate URL");\n    }\n\n    // Always use the DB-stored affiliate URL, preventing open redirects.\n    const destinationUrl = product.affiliate_url;\n\n    // Publish to the F-028 click queue (falls back to a direct DB write when\n    // the queue binding is absent). Wrapped in runAfterResponse so the\n    // Cloudflare isolate keeps the promise alive via ctx.waitUntil() after\n    // the redirect is sent — otherwise the write is silently dropped when\n    // the isolate shuts down under load.\n    void runAfterResponse(\n      publishClick({\n        site_id: siteId,\n        product_name: product.name,\n        affiliate_url: destinationUrl,\n        content_slug: searchParams.get("t") ?? "",\n        referrer: request.headers.get("referer") ?? undefined,\n      }),\n      { context: "[api/track/click] publishClick" },\n    );',
  `    // Validate product exists for this site and resolve affiliate URL
    // F-011: Use KV cache to avoid synchronous DB read on every click
    const cacheKey = \`product-url:\${siteId}:\${productSlug}\`;
    let cachedData: { name: string; url: string } | null = null;

    try {
      const kv = (process.env as any).RATE_LIMIT_KV as any;
      if (kv) {
        cachedData = await kv.get(cacheKey, "json");
      }
    } catch (e) {
      // Ignore KV errors and fallback to DB
    }

    if (!cachedData) {
      const product = await getProductBySlug(siteId, productSlug);
      if (!product || !product.affiliate_url) {
        return apiError(404, "Product not found or has no affiliate URL");
      }
      cachedData = { name: product.name, url: product.affiliate_url };

      // Update cache asynchronously
      try {
        const kv = (process.env as any).RATE_LIMIT_KV as any;
        if (kv) {
          void runAfterResponse(
            kv.put(cacheKey, JSON.stringify(cachedData), { expirationTtl: 3600 }),
            { context: "[api/track/click] cache product URL" }
          );
        }
      } catch (e) {}
    }

    const destinationUrl = cachedData.url;

    // Publish to the click queue (falls back to direct DB write if no binding)
    void runAfterResponse(
      publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        content_slug: searchParams.get("t") ?? "",
        referrer: request.headers.get("referer") ?? undefined,
      }),
      { context: "[api/track/click] publishClick" },
    );`
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/track/click/route.ts', clickRoute);

