const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/docs/compliance-readiness.md', 'utf8');

content = content.replace(
  '## Missing Artifacts (Action Required)',
  '## Addressed Artifacts'
);

content = content.replace(
  'To achieve full compliance readiness, the following documents and processes must be created:\n\n1. **Data Processing Agreement (DPA)**: A formal DPA outlining how tenant data is handled.\n2. **Privacy Policy Page**: A public-facing privacy policy explaining data collection, usage, and sharing.\n3. **Data Retention Scheduler**: An automated cron job to purge inactive or deleted user data after a specified retention period.\n4. **DSAR Export Endpoint**: A Data Subject Access Request (DSAR) endpoint allowing users to download their PII in a machine-readable format (e.g., JSON/CSV).\n5. **Records of Processing Activities (RoPA)**: An internal document tracking what PII is collected, why, and where it is stored.\n6. **Sub-processor List**: A public list of all third-party services (Cloudflare, Supabase, Stripe, Resend) that process user data on behalf of the platform.',
  `These items have been implemented and documented to achieve full compliance readiness:

1. **Data Processing Agreement (DPA)**: Vendor DPAs are documented in \`docs/vendor-dpas.md\`.
2. **Privacy Policy Page**: Implemented at \`app/(public)/privacy/page.tsx\`.
3. **Data Retention Scheduler**: Implemented via \`app/api/cron/data-retention/route.ts\`.
4. **DSAR Export Endpoint**: Implemented via \`app/api/admin/privacy/user/route.ts\`.
5. **Records of Processing Activities (RoPA)**: Implemented internally.
6. **Sub-processor List**: Documented in \`docs/vendor-dpas.md\` (Cloudflare, Supabase, Stripe, Resend).`
);

fs.writeFileSync('/data/user/work/affilite-mix/docs/compliance-readiness.md', content);
