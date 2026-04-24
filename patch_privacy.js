const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/admin/privacy/user/route.ts', 'utf8');

content = content.replace(
  '/** Simple hash for logging (not reversible) */\nfunction hashEmail(email: string): string {\n  let hash = 0;\n  const str = email.toLowerCase();\n  for (let i = 0; i < str.length; i++) {\n    const char = str.charCodeAt(i);\n    hash = (hash << 5) - hash + char;\n    hash = hash & hash;\n  }\n  return Math.abs(hash).toString(16).padStart(8, "0");\n}',
  'import crypto from "crypto";\n\n/** \n * HMAC-SHA256 hash for GDPR audit logging.\n * Replaces the weak 32-bit rolling hash to prevent dictionary attacks\n * on exported/erased user emails while still allowing correlation.\n */\nfunction hashEmail(email: string): string {\n  const secret = process.env.GDPR_HASH_SECRET || process.env.JWT_SECRET || "fallback-secret-do-not-use-in-prod";\n  return crypto\n    .createHmac("sha256", secret)\n    .update(email.toLowerCase().trim())\n    .digest("hex")\n    .substring(0, 16);\n}'
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/admin/privacy/user/route.ts', content);
