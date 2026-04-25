import { rateLimit } from '../../../../lib/rate-limit';

export async function loginWithTOTP(userId: string, ip: string, code: string) {
  // Lock on (user_id, ip /24) tuple
  const ipPrefix = ip.split('.').slice(0, 3).join('.');
  const rlKey = `totp_failures:${userId}:${ipPrefix}`;
  const allowed = await rateLimit(rlKey, { limit: 10, window: '1h', failClosed: true });
  
  if (!allowed) {
    throw new Error("Locked out. Try again later or use self-unlock.");
  }
  
  // Verify code
}
