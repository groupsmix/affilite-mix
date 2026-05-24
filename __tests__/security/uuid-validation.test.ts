import { describe, it, expect } from "vitest";
import { NIL_UUID, isUsableUuid, isUuidFormat } from "@/lib/security/uuid";

describe("isUsableUuid", () => {
  it("accepts a valid v4-style UUID", () => {
    expect(isUsableUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects the nil UUID", () => {
    expect(isUuidFormat(NIL_UUID)).toBe(true);
    expect(isUsableUuid(NIL_UUID)).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isUsableUuid("not-a-uuid")).toBe(false);
    expect(isUsableUuid("")).toBe(false);
  });
});
