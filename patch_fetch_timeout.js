const fs = require('fs');

function patch(file) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('fetchWithTimeout')) {
    content = 'import { fetchWithTimeout } from "@/lib/fetch-timeout";\n' + content;
    content = content.replace(/await fetch\(/g, 'await fetchWithTimeout(');
    fs.writeFileSync(file, content);
  }
}

patch('/data/user/work/affilite-mix/lib/turnstile.ts');
patch('/data/user/work/affilite-mix/lib/password-policy.ts');
patch('/data/user/work/affilite-mix/lib/resend.ts');

