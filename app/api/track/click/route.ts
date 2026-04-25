import { NextRequest } from 'next/server';
import { validateRequest } from '../../../../lib/api/validate';
import { sendApiError } from '../../../../lib/api/error';
import { rateLimit } from '../../../../lib/rate-limit';
import { z } from 'zod';
import { getSiteRowByDomain } from '../../../../lib/dal/sites';

const ClickSchema = z.object({
  token: z.string(),
  siteId: z.string(),
  slug: z.string(),
  tracking_id: z.string(),
  input: z.any()
});

export async function POST(req: NextRequest, ctx: any) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

  const body = await validateRequest(req, ClickSchema);
  if (body instanceof Response) return body;

  const { token, siteId, slug, tracking_id, input } = body;

  // Rate limit using specific key
  const rlKey = `click:${siteId}:${slug}:${ip}`;
  const isAllowed = await rateLimit(rlKey, { limit: 60, window: '1m', failClosed: false });
  if (!isAllowed) {
    return sendApiError("RATE_LIMIT_EXCEEDED", "Too many requests", 429);
  }

  return new Response("OK");
}
