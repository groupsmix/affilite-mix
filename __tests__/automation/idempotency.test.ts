import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  payloadHash,
  classifyIdempotency,
  isValidIdempotencyKey,
} from "@/lib/automation/idempotency";

describe("automation idempotency", () => {
  it("canonicalises objects regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1}}');
  });

  it("produces a stable hash for equivalent payloads", async () => {
    const h1 = await payloadHash({ title: "x", keywords: ["a", "b"] });
    const h2 = await payloadHash({ keywords: ["a", "b"], title: "x" });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different payloads hash differently", async () => {
    const h1 = await payloadHash({ title: "x" });
    const h2 = await payloadHash({ title: "y" });
    expect(h1).not.toBe(h2);
  });

  it("classifies fresh / replay / conflict", async () => {
    const hash = await payloadHash({ title: "x" });
    expect(classifyIdempotency(null, hash)).toEqual({ kind: "fresh" });

    const existing = { payload_hash: hash, id: "1" };
    expect(classifyIdempotency(existing, hash)).toEqual({ kind: "replay", existing });

    expect(classifyIdempotency({ payload_hash: "other" }, hash)).toEqual({ kind: "conflict" });
  });

  it("validates key shape", () => {
    expect(isValidIdempotencyKey("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isValidIdempotencyKey("op:create:2026-01-01")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("has spaces here")).toBe(false);
  });
});
