const fs = require('fs');

function patch(file) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('fetchWithTimeout')) {
    content = 'import { fetchWithTimeout } from "@/lib/fetch-timeout";\n' + content;
  }
  content = content.replace(/await fetch\(/g, 'await fetchWithTimeout(');
  fs.writeFileSync(file, content);
}

patch('/data/user/work/affilite-mix/app/api/auth/forgot-password/route.ts');
patch('/data/user/work/affilite-mix/app/api/cron/price-scrape/route.ts');
patch('/data/user/work/affilite-mix/app/api/health/route.ts');
patch('/data/user/work/affilite-mix/app/api/membership/checkout/route.ts');
patch('/data/user/work/affilite-mix/app/api/newsletter/route.ts');

