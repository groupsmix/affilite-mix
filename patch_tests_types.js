const fs = require('fs');

// Fix SSRF tests
let ssrfTestContent = fs.readFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', 'utf8');
ssrfTestContent = ssrfTestContent.replace(/expect\(validateExternalUrl/g, 'expect((await validateExternalUrl');
ssrfTestContent = ssrfTestContent.replace(/\)\.valid\)/g, ')).valid)');
ssrfTestContent = ssrfTestContent.replace(/it\("/g, 'it("');
ssrfTestContent = ssrfTestContent.replace(/it\("([^"]+)", \(\) => {/g, 'it("$1", async () => {');
fs.writeFileSync('/data/user/work/affilite-mix/__tests__/ssrf-guard.test.ts', ssrfTestContent);

// Fix webhook signature import
let webhookContent = fs.readFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', 'utf8');
webhookContent = webhookContent.replace('import { verifyWebhookSignature } from "@/lib/stripe-webhook";', 'import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook";');
webhookContent = webhookContent.replace('await verifyStripeSignature', 'await verifyStripeWebhookSignature');
fs.writeFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', webhookContent);
