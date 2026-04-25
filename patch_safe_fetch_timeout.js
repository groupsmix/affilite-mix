const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', 'utf8');

if (!content.includes('fetchWithTimeout')) {
  content = 'import { fetchWithTimeout } from "@/lib/fetch-timeout";\n' + content;
  content = content.replace(
    '  return fetch(urlString, options);\n}',
    '  return fetchWithTimeout(urlString, {\n    timeoutMs: 15000, // Default 15s timeout to prevent hanging\n    ...options\n  });\n}'
  );
  fs.writeFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', content);
}
