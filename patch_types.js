const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', 'utf8');

content = content.replace(
  'export async function validateExternalUrl(\n  urlString: string,\n  allowPrivateIPs = false,\n): UrlValidationResult {',
  'export async function validateExternalUrl(\n  urlString: string,\n  allowPrivateIPs = false,\n): Promise<UrlValidationResult> {'
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/ssrf-guard.ts', content);

let webhookContent = fs.readFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', 'utf8');
webhookContent = webhookContent.replace('verifyStripeSignature', 'verifyWebhookSignature');
fs.writeFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', webhookContent);
