import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

export function verifyCronAuth(
  request: NextRequest,
  options: { secretEnvVars?: string[] } = {},
): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const envNames = options.secretEnvVars ?? ["CRON_SECRET"];

  return envNames.some((envName) => {
    const secret = process.env[envName];
    if (!secret) return false;
    
    const expected = `Bearer ${secret}`;
    
    // Prevent timing attacks on secret comparison
    if (auth.length !== expected.length) {
      return false;
    }
    
    return timingSafeEqual(
      Buffer.from(auth),
      Buffer.from(expected)
    );
  });
}
