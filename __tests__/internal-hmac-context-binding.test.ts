/**
 * audit #7 — the internal HMAC signature must bind the operation
 * (method + path + query), not just the body.
 *
 * Before the fix the signed message was `${timestamp}\n${nonce}\n${body}`, so a
 * captured, validly-signed request to `/api/queue/clicks` could be replayed with
 * `?dlq=true` appended (rerouting an insert into the dead-letter branch) without
 * invalidating the signature. These tests pin that the bound signature now
 * covers the path + query, and that the compat/strict rollout switch behaves.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  signInternalRequest,
  verifyInternalHmac,
  buildInternalHmacContext,
} from "@/lib/internal-hmac";

const SECRET = "test-internal-token";
const BODY = JSON.stringify({ messages: [] });

function reqTo(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: "POST", headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audit #7: internal HMAC context binding", () => {
  it("buildInternalHmacContext returns METHOD\\npath?query from an absolute URL", () => {
    expect(buildInternalHmacContext("post", "https://h.example/api/queue/clicks?dlq=true")).toBe(
      "POST\n/api/queue/clicks?dlq=true",
    );
    expect(buildInternalHmacContext("POST", "https://h.example/api/queue/clicks")).toBe(
      "POST\n/api/queue/clicks",
    );
  });

  it("a bound signature verifies against the same operation", async () => {
    const url = "https://h.example/api/queue/clicks";
    const headers = await signInternalRequest(
      SECRET,
      BODY,
      {},
      buildInternalHmacContext("POST", url),
    );
    const res = await verifyInternalHmac(SECRET, reqTo(url, headers), BODY);
    expect(res.valid).toBe(true);
  });

  it("strict mode rejects a signature replayed onto ?dlq=true", async () => {
    vi.stubEnv("INTERNAL_HMAC_BIND_MODE", "strict");
    // Signed for the normal queue path (no ?dlq); attacker appends ?dlq=true.
    const signedUrl = "https://h.example/api/queue/clicks";
    const replayUrl = "https://h.example/api/queue/clicks?dlq=true";
    const headers = await signInternalRequest(
      SECRET,
      BODY,
      {},
      buildInternalHmacContext("POST", signedUrl),
    );
    const res = await verifyInternalHmac(SECRET, reqTo(replayUrl, headers), BODY);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("Signature mismatch");
  });

  it("compat mode (default) still accepts a legacy unbound signature during rollout", async () => {
    const url = "https://h.example/api/queue/clicks";
    // Legacy signer: no context passed.
    const headers = await signInternalRequest(SECRET, BODY, {});
    const res = await verifyInternalHmac(SECRET, reqTo(url, headers), BODY);
    expect(res.valid).toBe(true);
  });

  it("strict mode rejects a legacy unbound signature", async () => {
    vi.stubEnv("INTERNAL_HMAC_BIND_MODE", "strict");
    const url = "https://h.example/api/queue/clicks";
    const headers = await signInternalRequest(SECRET, BODY, {});
    const res = await verifyInternalHmac(SECRET, reqTo(url, headers), BODY);
    expect(res.valid).toBe(false);
  });
});
