const fs = require('fs');

let authz = fs.readFileSync('/data/user/work/affilite-mix/lib/authz.ts', 'utf8');
authz = authz.replace(
  '      // If the route doesn\'t specify a site_id but requires authz,\n      // we check if they have super_admin or owner global role.\n      // (This mimics the global bypass in hasPermission)\n      // NOTE: "owner" was mentioned in the spec but type AdminPayload role is "admin" | "super_admin".\n      // We will allow super_admin for global routes.',
  '      // If the route doesn\'t specify a site_id but requires authz,\n      // we check if they have super_admin global role.\n      // (This mimics the global bypass in hasPermission)'
);
fs.writeFileSync('/data/user/work/affilite-mix/lib/authz.ts', authz);

let cron = fs.readFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', 'utf8');
cron = cron.replace(
  '  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {',
  '  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {'
);
fs.writeFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', cron);
