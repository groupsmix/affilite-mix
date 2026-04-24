const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/rate-limit.ts', 'utf8');

content = content.replace(/\/\/ Fail closed immediately in production[\s\S]*?return \{ allowed: false, remaining: 0, retryAfterMs: 60_000 \};/g, 
  '// Fail OPEN gracefully in production to in-memory fallback instead of failing closed\n  if (!kvUnavailableAlerted) {\n    kvUnavailableAlerted = true;\n    const msg =\n      `[rate-limit] WARNING: KV unavailable (${reason}). ` +\n      "Fail-open: rate-limited requests will temporarily use per-isolate memory fallback. " +\n      "Configure the KV binding in wrangler.jsonc to restore distributed rate limiting.";\n    console.error(msg);\n    captureException(err ?? new Error(msg), {\n      context: "rate-limit.kv-unavailable-fail-open",\n    });\n  }\n\n  return checkRateLimitMemory(key, config);');

fs.writeFileSync('/data/user/work/affilite-mix/lib/rate-limit.ts', content);
