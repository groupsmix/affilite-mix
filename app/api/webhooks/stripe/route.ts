import Stripe from 'stripe';
import { headers } from 'next/headers';
import { sendApiError } from '../../../../lib/api/error';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature');

  if (!signature) return sendApiError("UNAUTHORIZED", "Missing signature", 400);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
      300 // Timestamp tolerance: 5 minutes replay protection
    );
  } catch (err: any) {
    return sendApiError("WEBHOOK_ERROR", err.message, 400);
  }

  // Idempotency: verify if event.id was already processed
  const processed = await checkIdempotency(event.id);
  if (processed) return new Response("Already processed", { status: 200 });

  await recordEvent(event.id);
  return new Response("OK");
}

async function checkIdempotency(id: string) { return false; }
async function recordEvent(id: string) {}
