import { NextRequest } from 'next/server';
import { sendApiError } from '../../../../lib/api/error';
import { timingSafeEqual } from 'crypto';

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INTERNAL_RESOLVE_TOKEN}`;
  
  if (!auth || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return sendApiError("UNAUTHORIZED", "Internal endpoint access denied", 401);
  }

  return new Response("OK");
}
