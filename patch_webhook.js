const fs = require('fs');
let content = fs.readFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', 'utf8');

content = content.replace(
  'import Stripe from "stripe";',
  'import { verifyStripeSignature } from "@/lib/stripe-webhook";'
);

content = content.replace(
  '  const stripe = new Stripe(stripeKey, {\n    apiVersion: null as any,\n    appInfo: { name: "affilite-mix" },\n    httpClient: Stripe.createFetchHttpClient(),\n  });\n\n  const rawBody = await request.text();\n  const signature = request.headers.get("stripe-signature");\n\n  if (!signature) {\n    return NextResponse.json({ error: "Missing signature" }, { status: 400 });\n  }\n\n  let event: Stripe.Event;\n  try {\n    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);\n  } catch (err) {',
  '  const rawBody = await request.text();\n  const signature = request.headers.get("stripe-signature");\n\n  if (!signature) {\n    return NextResponse.json({ error: "Missing signature" }, { status: 400 });\n  }\n\n  let event: any;\n  try {\n    // F-009: Use lightweight Web Crypto verifier instead of full Stripe SDK\n    // to avoid edge runtime bloat/incompatibility.\n    const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);\n    if (!isValid) throw new Error("Signature verification failed");\n    event = JSON.parse(rawBody);\n  } catch (err) {'
);

content = content.replace(
  '  try {\n    await processStripeEvent(stripe, event);\n    return NextResponse.json({ received: true });\n  } catch (err) {',
  '  try {\n    // Only import the heavy Stripe SDK when processing is actually needed\n    const Stripe = (await import("stripe")).default;\n    const stripe = new Stripe(stripeKey, {\n      apiVersion: null as any,\n      appInfo: { name: "affilite-mix" },\n      httpClient: Stripe.createFetchHttpClient(),\n    });\n    \n    await processStripeEvent(stripe, event);\n    return NextResponse.json({ received: true });\n  } catch (err) {'
);

fs.writeFileSync('/data/user/work/affilite-mix/app/api/membership/webhook/route.ts', content);
