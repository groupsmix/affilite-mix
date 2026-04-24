const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', 'utf8');

content = content.replace(
  '  const result = validateExternalUrl(urlString, allowPrivateIPs);',
  '  const result = await validateExternalUrl(urlString, allowPrivateIPs);'
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', content);
