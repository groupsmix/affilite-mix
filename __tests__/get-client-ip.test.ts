import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClientIp } from "@/lib/get-client-ip";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/", { headers });
}

describe("getClientIp", () => {
  const originalFlag = process.env.TRUST_PROXY_HEADERS;

  beforeEach(() => {
    delete process.env.TRUST_PROXY_HEADERS;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalFlag;
    }
  });

  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const req = makeRequest({
      "cf-connecting-ip": "203.0.113.1",
      "x-forwarded-for": "10.0.0.1",
    });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("ignores x-forwarded-for by default (no trusted-proxy signal)", () => {
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("honours x-forwarded-for when TRUST_PROXY_HEADERS=true", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("honours x-forwarded-for when TRUST_PROXY_HEADERS=1", () => {
    process.env.TRUST_PROXY_HEADERS = "1";
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no trusted header is present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' when TRUST_PROXY_HEADERS is unset even with XFF", () => {
    const req = makeRequest({ "x-forwarded-for": "198.51.100.1" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("ignores x-forwarded-for when TRUST_PROXY_HEADERS is a non-truthy value", () => {
    process.env.TRUST_PROXY_HEADERS = "false";
    const req = makeRequest({ "x-forwarded-for": "198.51.100.1" });
    expect(getClientIp(req)).toBe("unknown");
  });
});
