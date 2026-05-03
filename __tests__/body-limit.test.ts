import { describe, it, expect } from "vitest";
import { readBodyWithLimit, readJsonWithLimit, BodyTooLargeError } from "@/lib/body-limit";

/** Create a Request with a readable stream body of the given text. */
function makeRequest(body: string, headers?: Record<string, string>): Request {
  return new Request("https://example.com/api/test", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

/** Create a Request with an explicit content-length override. */
function makeRequestWithLength(body: string, declaredLength: number): Request {
  return new Request("https://example.com/api/test", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "content-length": String(declaredLength),
    },
  });
}

describe("readBodyWithLimit", () => {
  it("reads a small body successfully", async () => {
    const req = makeRequest('{"ok":true}');
    const result = await readBodyWithLimit(req, 1024);
    expect(result).toBe('{"ok":true}');
  });

  it("throws BodyTooLargeError when content-length exceeds limit", async () => {
    const req = makeRequestWithLength("x", 2_000_000);
    await expect(readBodyWithLimit(req, 1_000_000)).rejects.toThrow(BodyTooLargeError);
  });

  it("throws BodyTooLargeError when stream bytes exceed limit", async () => {
    const bigBody = "x".repeat(2048);
    const req = makeRequest(bigBody);
    await expect(readBodyWithLimit(req, 1024)).rejects.toThrow(BodyTooLargeError);
  });

  it("returns empty string for no-body request", async () => {
    const req = new Request("https://example.com/api/test", { method: "POST" });
    const result = await readBodyWithLimit(req, 1024);
    expect(typeof result).toBe("string");
  });

  it("error has correct code property", async () => {
    const req = makeRequest("x".repeat(2048));
    try {
      await readBodyWithLimit(req, 1024);
      expect.fail("Expected BodyTooLargeError");
    } catch (err) {
      expect(err).toBeInstanceOf(BodyTooLargeError);
      expect((err as BodyTooLargeError).code).toBe("PAYLOAD_TOO_LARGE");
      expect((err as BodyTooLargeError).limit).toBe(1024);
    }
  });
});

describe("readJsonWithLimit", () => {
  it("parses valid JSON within limit", async () => {
    const req = makeRequest('{"key":"value"}');
    const result = await readJsonWithLimit<{ key: string }>(req, 1024);
    expect(result).toEqual({ key: "value" });
  });

  it("throws SyntaxError for invalid JSON", async () => {
    const req = makeRequest("not json");
    await expect(readJsonWithLimit(req, 1024)).rejects.toThrow(SyntaxError);
  });

  it("throws BodyTooLargeError before parsing when too large", async () => {
    const bigBody = '{"data":"' + "x".repeat(2048) + '"}';
    const req = makeRequest(bigBody);
    await expect(readJsonWithLimit(req, 1024)).rejects.toThrow(BodyTooLargeError);
  });
});
