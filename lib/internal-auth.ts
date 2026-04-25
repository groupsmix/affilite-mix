export const INTERNAL_RESOLVE_TOKEN = process.env.INTERNAL_RESOLVE_TOKEN;
export const QUEUE_CONSUMER_TOKEN = process.env.QUEUE_CONSUMER_TOKEN;
export const REVALIDATE_TOKEN = process.env.REVALIDATE_TOKEN;

// Fix F-22: Build-phase INTERNAL_API_TOKEN returns dev fallback string
export function getInternalToken() {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return new Proxy({}, {
      get() { throw new Error("Do not use internal token during build phase"); }
    });
  }
  return process.env.INTERNAL_RESOLVE_TOKEN || "DEV_FALLBACK_INTERNAL_TOKEN";
}
