const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/middleware.ts', 'utf8');

content = content.replace(
  'import { buildCspHeader, generateCspNonce, NONCE_HEADER } from "@/lib/csp";',
  'import { buildCspHeader, generateCspNonce, NONCE_HEADER } from "@/lib/csp";\nimport { captureException } from "@/lib/sentry";'
);

const searchStr = `  // 2. For unknown domains (dashboard-managed custom domains), do direct DB lookup.
  //    Previous implementation used a self-fetch to /api/internal/resolve-site
  //    which added latency and coupling on the hot path.
  if (!siteId && !isLocalhostDev) {
    try {
      const cacheKey = \`site-domain:\${hostname}\`;
      let cachedRow = null;
      try {
        const kv = (process.env as any).RATE_LIMIT_KV as any;
        if (kv) cachedRow = await kv.get(cacheKey, "json");
      } catch (e) {}

      const row = cachedRow || (await getSiteRowByDomain(hostname));
      if (row && !cachedRow) {
        try {
          const kv = (process.env as any).RATE_LIMIT_KV as any;
          if (kv) await kv.put(cacheKey, JSON.stringify(row), { expirationTtl: 300 });
        } catch (e) {}
      }
      if (row && row.is_active) {
        siteId = row.slug;
      } else if (row && !row.is_active) {
        return nicheNotFoundResponse(request);
      }
    } catch {
      // DB lookup failed; fall through to 404
    }
  }`;

const replaceStr = `  // Generate a trace ID for request correlation across logs/Sentry/downstream calls.
  // Reuse an existing x-trace-id (from an upstream proxy) or cf-ray; otherwise mint a new one.
  // We do this early so we can log it if the DB lookup fails.
  const traceId =
    request.headers.get(TRACE_ID_HEADER) ?? request.headers.get("cf-ray") ?? generateTraceId();

  // 2. For unknown domains (dashboard-managed custom domains), do direct DB lookup.
  //    Previous implementation used a self-fetch to /api/internal/resolve-site
  //    which added latency and coupling on the hot path.
  if (!siteId && !isLocalhostDev) {
    try {
      const cacheKey = \`site-domain:\${hostname}\`;
      let cachedRow = null;
      try {
        const kv = (process.env as any).RATE_LIMIT_KV as any;
        if (kv) cachedRow = await kv.get(cacheKey, "json");
      } catch (e) {}

      const row = cachedRow || (await getSiteRowByDomain(hostname));
      if (row && !cachedRow) {
        try {
          const kv = (process.env as any).RATE_LIMIT_KV as any;
          if (kv) await kv.put(cacheKey, JSON.stringify(row), { expirationTtl: 300 });
        } catch (e) {}
      }
      if (row && row.is_active) {
        siteId = row.slug;
      } else if (row && !row.is_active) {
        return nicheNotFoundResponse(request);
      }
    } catch (err) {
      // F-025: Log structured error with trace id and emit Sentry instead of silent failure
      console.error(\`[middleware] DB lookup failed for domain: \${hostname}\`, { traceId, err });
      captureException(err, { 
        context: "[middleware] getSiteRowByDomain", 
        extra: { hostname, traceId } 
      });
      
      // Serve a branded temporary unavailable response rather than a confusing 404
      return new NextResponse(
        JSON.stringify({ 
          error: "Service Temporarily Unavailable", 
          message: "The platform is currently experiencing database connectivity issues.",
          traceId 
        }), 
        { 
          status: 503,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }`;

content = content.replace(searchStr, replaceStr);

content = content.replace(
  '  // Generate a trace ID for request correlation across logs/Sentry/downstream calls.\n  // Reuse an existing x-trace-id (from an upstream proxy) or cf-ray; otherwise mint a new one.\n  const traceId =\n    request.headers.get(TRACE_ID_HEADER) ?? request.headers.get("cf-ray") ?? generateTraceId();',
  ''
);

fs.writeFileSync('/data/user/work/affilite-mix/middleware.ts', content);
