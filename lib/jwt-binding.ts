export function bindJWT(ip: string) {
  // Bind on IP /24 only, no UA
  const ipPrefix = ip.split('.').slice(0, 3).join('.');
  return `bound:${ipPrefix}`;
}

export function verifyJWTBinding(tokenBinding: string, currentIp: string, isWriteEndpoint: boolean) {
  const currentPrefix = currentIp.split('.').slice(0, 3).join('.');
  if (tokenBinding !== `bound:${currentPrefix}`) {
    if (isWriteEndpoint) {
      throw new Error("Binding mismatch on write endpoint");
    } else {
      console.warn("Soft mismatch on read endpoint");
      // log + Sentry breadcrumb
    }
  }
}
