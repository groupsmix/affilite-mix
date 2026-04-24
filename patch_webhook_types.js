const fs = require('fs');

let webhookContent = fs.readFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', 'utf8');
webhookContent = webhookContent.replace('import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook";', 'import { constructStripeEvent } from "@/lib/stripe-webhook";');
webhookContent = webhookContent.replace('const isValid = await verifyStripeWebhookSignature(rawBody, signature, webhookSecret);\n    if (!isValid) throw new Error("Signature verification failed");\n    event = JSON.parse(rawBody);', 'event = await constructStripeEvent(rawBody, signature, webhookSecret);');

fs.writeFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', webhookContent);
