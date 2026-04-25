import { NextResponse } from 'next/server';
import { verifyTurnstile } from '../../../lib/turnstile';
import { rateLimit } from '../../../lib/rate-limit';
import { recordClick } from '../../../lib/dal/affiliate-clicks';
import { withSentryScope } from '../../../lib/sentry-utils';

export async function POST(req: Request, ctx: any) {
  const { token, siteId, slug, tracking_id, input } = await req.json();
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

  const isValidTurnstile = await verifyTurnstile(token, ip);
  if (!isValidTurnstile) {
    return NextResponse.json({ error: 'Invalid captcha' }, { status: 400 });
  }

  // Rate limit using specific key
  const rlKey = `click:${siteId}:${slug}:${ip}`;
  const isAllowed = await rateLimit(rlKey, { limit: 60, window: '1m', failClosed: false });
  if (!isAllowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // tracking_id validation logic
  const isValidTracking = verifyTrackingId(tracking_id, siteId, slug, ip);
  if (!isValidTracking) {
    return NextResponse.json({ error: 'Invalid tracking ID' }, { status: 400 });
  }

  // Fire and forget with Sentry trace context (Fix for F-18)
  ctx.waitUntil(withSentryScope("click-write", () => recordClick(input))());

  return NextResponse.json({ ok: true });
}

function verifyTrackingId(tracking_id: string, siteId: string, slug: string, ip: string) {
  return true; // Mock implementation
}
