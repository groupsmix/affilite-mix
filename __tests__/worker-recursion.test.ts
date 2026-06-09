/**
 * F-017: self-reference recursion ceiling resolution.
 *
 * The ceiling was tightened from 3 to a default of 2 and made env-tunable
 * via MAX_WORKER_RECURSION_DEPTH. These tests pin the default, the override
 * path, and the fail-safe clamping so a misconfigured env value can never
 * silently disable or explode the amplification guard.
 */
import { describe, it, expect } from "vitest";
import {
  resolveMaxRecursionDepth,
  DEFAULT_MAX_RECURSION_DEPTH,
  RECURSION_DEPTH_HEADER,
} from "@/lib/worker-recursion";

describe("F-017: resolveMaxRecursionDepth", () => {
  it("defaults to the tightened ceiling of 2 when unset", () => {
    expect(DEFAULT_MAX_RECURSION_DEPTH).toBe(2);
    expect(resolveMaxRecursionDepth(undefined)).toBe(2);
    expect(resolveMaxRecursionDepth("")).toBe(2);
    expect(resolveMaxRecursionDepth("   ")).toBe(2);
  });

  it("honors a valid in-range override", () => {
    expect(resolveMaxRecursionDepth("1")).toBe(1);
    expect(resolveMaxRecursionDepth("3")).toBe(3);
    expect(resolveMaxRecursionDepth("10")).toBe(10);
  });

  it("falls back to the default for out-of-range values", () => {
    // 0 would disable the guard entirely; >10 would defeat the point.
    expect(resolveMaxRecursionDepth("0")).toBe(2);
    expect(resolveMaxRecursionDepth("-1")).toBe(2);
    expect(resolveMaxRecursionDepth("11")).toBe(2);
    expect(resolveMaxRecursionDepth("9999")).toBe(2);
  });

  it("falls back to the default for non-numeric junk", () => {
    expect(resolveMaxRecursionDepth("abc")).toBe(2);
    expect(resolveMaxRecursionDepth("two")).toBe(2);
    expect(resolveMaxRecursionDepth("NaN")).toBe(2);
  });

  it("parses leading integers like parseInt (defensive, not relied upon)", () => {
    // "3x" -> 3 is acceptable; the point is it never throws and stays in range.
    const v = resolveMaxRecursionDepth("3x");
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(10);
  });

  it("keeps the header name stable (cross-hop contract)", () => {
    expect(RECURSION_DEPTH_HEADER).toBe("x-worker-recursion-depth");
  });
});
