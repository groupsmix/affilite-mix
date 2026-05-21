import { describe, it, expect } from "vitest";
import { computeRequestBinding, verifyRequestBinding } from "@/lib/jwt-binding";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

describe("F-035 JWT UA/IP binding", () => {
  it("computes a stable hash for identical UA + IP", async () => {
    const a = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const b = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    expect(await computeRequestBinding(a)).toBe(await computeRequestBinding(b));
  });

  it("collapses last octet so mobile NAT shifts still match", async () => {
    const a = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const b = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.99",
    });
    expect(await computeRequestBinding(a)).toBe(await computeRequestBinding(b));
  });

  it("detects a different /24", async () => {
    const a = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const b = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.114.42",
    });
    expect(await computeRequestBinding(a)).not.toBe(await computeRequestBinding(b));
  });

  it("detects a user-agent change", async () => {
    const a = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const b = makeRequest({
      "user-agent": "curl/8.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    expect(await computeRequestBinding(a)).not.toBe(await computeRequestBinding(b));
  });

  it("returns null when UA is missing and IP is unknown", async () => {
    const req = makeRequest({});
    expect(await computeRequestBinding(req)).toBeNull();
  });

  it("verifyRequestBinding: accepts tokens without a binding claim", async () => {
    const req = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    expect(await verifyRequestBinding(undefined, req)).toBe(true);
  });

  it("verifyRequestBinding: rejects mismatch", async () => {
    const issuedFrom = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const issuedBinding = (await computeRequestBinding(issuedFrom))!;
    expect(issuedBinding).toBeTruthy();

    const replayedFrom = makeRequest({
      "user-agent": "curl/8.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    expect(await verifyRequestBinding(issuedBinding, replayedFrom)).toBe(false);
  });

  it("verifyRequestBinding: accepts identical request", async () => {
    const req = makeRequest({
      "user-agent": "Mozilla/5.0",
      "cf-connecting-ip": "203.0.113.42",
    });
    const binding = (await computeRequestBinding(req))!;
    expect(await verifyRequestBinding(binding, req)).toBe(true);
  });

  it("verifyRequestBinding: accepts when request is absent (background jobs)", async () => {
    expect(await verifyRequestBinding("deadbeef", undefined)).toBe(true);
  });

  // P0-BIND: regression — a token with a binding claim must NOT be accepted
  // in production when the current request produces no fingerprint material.
  // Previously `verifyRequestBinding` returned true in this case, which let
  // a stolen token be replayed by any client that stripped its UA and
  // arrived without a trusted source IP (e.g. direct-to-origin hits that
  // bypass Cloudflare and therefore have no cf-connecting-ip).
  it("verifyRequestBinding: rejects unrecomputable binding when required (P0-BIND)", async () => {
    // Token carries a binding, but the replay request has no UA and no IP.
    const noFingerprintRequest = makeRequest({});
    expect(await computeRequestBinding(noFingerprintRequest)).toBeNull();

    // requireBinding=true (production posture): must fail closed.
    expect(await verifyRequestBinding("deadbeef", noFingerprintRequest, true)).toBe(false);
  });

  it("verifyRequestBinding: lenient in dev when binding not required (P0-BIND)", async () => {
    // Same scenario but with requireBinding=false keeps the previous
    // permissive behaviour so dev flows without headers still work.
    const noFingerprintRequest = makeRequest({});
    expect(await verifyRequestBinding("deadbeef", noFingerprintRequest, false)).toBe(true);
  });
});

describe("JWT verification rotation & kid logic", () => {
  it("verifyToken: rejects tokens signed with old secret after rotation window expires", async () => {
    // This is a conceptual test. In `lib/auth.ts`, `verifyToken` uses `getPreviousSecretKey()`.
    // We want to ensure that if `getPreviousSecretKey()` returns null (meaning rotation window closed),
    // the old token is rejected.
    
    vi.doMock("@/lib/jwt-secret", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@/lib/jwt-secret")>();
      return {
        ...mod,
        getJwtSecret: () => "current-secret-123456789012345678901234567890",
        getJwtSecretPrevious: () => null, // Window closed
        getJwtKid: () => "kid-current",
      };
    });

    const { verifyToken } = await import("@/lib/auth");
    
    // Create a token signed with the "old" secret manually
    const { SignJWT } = await import("jose");
    const oldSecret = new TextEncoder().encode("old-secret-123456789012345678901234567890");
    const oldToken = await new SignJWT({ email: "admin@test.com", role: "admin" })
      .setProtectedHeader({ alg: "HS256", kid: "kid-old" })
      .setExpirationTime("4h")
      .sign(oldSecret);

    const decoded = await verifyToken(oldToken);
    expect(decoded).toBeNull();
    
    vi.resetModules();
  });
  it("verifyToken: rejects tokens with unknown kid (signature mismatch)", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");
    // to simulate a scenario where the token's kid doesn't match current or previous
    
    // Actually, `verifyToken` uses `getSecretKey()` and `getPreviousSecretKey()`.
    // It doesn't strictly read the `kid` from the header to look up a key from a JWKS.
    // It tries current key, then previous key.
    // Let's test that if we sign with a completely unrelated key, it fails.
    
    const payload = { email: "admin@test.com", role: "admin" as const };
    const token = await createToken(payload);
    
    // Tamper the signature so it's invalid
    const parts = token.split('.');
    parts[2] = 'tampered_signature_that_is_long_enough_to_fail_decoding_or_verification';
    const tampered = parts.join('.');
    
    const decoded = await verifyToken(tampered);
    expect(decoded).toBeNull();
  });
});
