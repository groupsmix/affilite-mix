const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', 'utf8');

content = content.replace(
  'import { safeFetch } from "@/lib/ssrf-guard";',
  'import { safeFetch } from "@/lib/ssrf-guard";\nimport { fetchWithTimeout } from "@/lib/fetch-timeout";'
);

content = content.replace(
  '  const response = await safeFetch(',
  '  const response = await fetchWithTimeout('
);

content = content.replace(
  '  const response = await safeFetch("https://api.admitad.com/statistics/actions/", {',
  '  const response = await fetchWithTimeout("https://api.admitad.com/statistics/actions/", {\n    timeoutMs: 30000,'
);

content = content.replace(
  '  const response = await safeFetch("https://api.partnerstack.com/api/v2/transactions", {',
  '  const response = await fetchWithTimeout("https://api.partnerstack.com/api/v2/transactions", {\n    timeoutMs: 30000,'
);

content = content.replace(
  '        Authorization: `Bearer ${apiKey}`,\n      },\n    },',
  '        Authorization: `Bearer ${apiKey}`,\n      },\n      timeoutMs: 30000,\n    },'
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/cron/commission-ingest/route.ts', content);
