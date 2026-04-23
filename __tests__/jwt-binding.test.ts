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
});
