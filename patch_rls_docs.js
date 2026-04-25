const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/docs/public-rls-inventory.md', 'utf8');

content = content.replace(
  'Every table with Row-Level Security enabled is listed below. Since\nmigration **00035** (drops all public SELECT policies + REVOKEs SELECT\nfrom `anon` on every tenant-scoped table), **00038** (drops any\nresidual anon INSERT policies on telemetry tables + REVOKEs INSERT from\n`anon`), and **00039** (second-pass cleanup for historical public SELECT\npolicy names that 00035 didn\'t cover), **the `anon` role has no direct\nread or write access to any public-schema table**. All public-facing\ndata is served via server-side DAL functions that use the service-role\nclient from `lib/supabase-server.ts` (`getServiceClient()`).',
  'Every table with Row-Level Security enabled is listed below.\n\n**Update (F-002 Fix):** Migration **00038_reintroduce_public_rls** re-granted `SELECT` access to the `anon` role for public-facing tables (`sites`, `categories`, `products`, `content`, `pages`, `content_products`, `ad_placements`) and reinstated strict RLS policies. The Data Access Layer (DAL) for public pages now uses `getAnonClient()` to enforce tenant isolation at the database level, preventing cross-tenant data leaks in the event of an application-layer bug.'
);

content = content.replace(
  '### Tables with public-read SELECT policies\n\n**None.** Migration 00035 dropped the 7 previously-public read policies\n(`public_read_sites`, `public_read_categories`,\n`public_read_active_products`, `public_read_published_content`,\n`public_read_content_products`, `public_read_published_pages`,\n`ad_placements_public_read`) and REVOKEd `SELECT` on each of those\ntables from the `anon` role. Migration 00039 then swept any remaining\nhistorical public SELECT policy names that 00035 didn\'t cover by\nexplicit `DROP POLICY IF EXISTS` (idempotent).\n\nHistorical detail: the pre-00035 policies all included an active-site\nguard (`EXISTS (sites WHERE id = site_id AND is_active)` — added in\nmigrations 00024 + 00031), so the removal did not tighten access for\ndeactivated sites — it tightened access for **every** site, moving\npublic reads fully behind the server-side API.',
  `### Tables with public-read SELECT policies

The following tables have \`SELECT\` access granted to the \`anon\` role, protected by strict RLS policies that enforce \`is_active = true\` and \`status = 'published'/'active'\`:

- \`sites\` (\`public_read_sites\`)
- \`categories\` (\`public_read_categories\`)
- \`products\` (\`public_read_active_products\`)
- \`content\` (\`public_read_published_content\`)
- \`pages\` (\`public_read_published_pages\`)
- \`content_products\` (\`public_read_content_products\`)
- \`ad_placements\` (\`ad_placements_public_read\`)`
);

content = content.replace(
  '## Tenant-binding analysis\n\nWith no public read or write policies on any tenant-scoped table, the\n`anon` role cannot reach application data directly. Tenant isolation on\nthe server side is enforced by DAL helpers (`lib/dal/*.ts`) that\naccept an explicit `siteId` argument and scope every query by it.',
  '## Tenant-binding analysis\n\nTenant isolation is enforced by strict RLS policies on the database side (checking `site_id` and `sites.is_active = true`), and the public Data Access Layer (`lib/dal/*.ts`) queries data using the `anon` client (`getAnonClient()`). This provides defense-in-depth: if a DAL function accidentally omits a `site_id` filter, the database RLS will still block unauthorized cross-tenant reads.'
);

fs.writeFileSync('/data/user/work/affilite-mix/docs/public-rls-inventory.md', content);
