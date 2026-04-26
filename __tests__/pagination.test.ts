/**
 * Tests for the parsePagination helper (audit item #22).
 */
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { parsePagination } from "@/lib/pagination";

function params(qs: string): URLSearchParams {
  return new URL(`https://example.test/?${qs}`).searchParams;
}

describe("parsePagination", () => {
  it("returns the default pagination when no params are present", () => {
    const result = parsePagination(params(""));
    expect(result).toEqual({ limit: 50, offset: 0 });
  });

  it("clamps oversized limits down to maxLimit", () => {
    const result = parsePagination(params("limit=10000"));
    expect(result).toEqual({ limit: 100, offset: 0 });
  });

  it("clamps zero/negative limits up to 1", () => {
    expect(parsePagination(params("limit=0"))).toEqual({ limit: 1, offset: 0 });
    expect(parsePagination(params("limit=-3"))).toEqual({ limit: 1, offset: 0 });
  });

  it("rejects non-finite limit and offset", () => {
    const r1 = parsePagination(params("limit=NaN"));
    const r2 = parsePagination(params("offset=NaN"));
    expect(r1).toBeInstanceOf(NextResponse);
    expect(r2).toBeInstanceOf(NextResponse);
  });

  it("rejects negative offsets", () => {
    const r = parsePagination(params("offset=-1"));
    expect(r).toBeInstanceOf(NextResponse);
  });

  it("rejects offsets beyond maxOffset", () => {
    const r = parsePagination(params("offset=999999"));
    expect(r).toBeInstanceOf(NextResponse);
  });

  it("rejects non-integer values like '10.5'", () => {
    const r = parsePagination(params("limit=10.5"));
    expect(r).toBeInstanceOf(NextResponse);
  });

  it("honours custom defaults", () => {
    const r = parsePagination(params(""), { defaultLimit: 25, maxLimit: 200 });
    expect(r).toEqual({ limit: 25, offset: 0 });
  });

  it("honours custom maxLimit", () => {
    const r = parsePagination(params("limit=999"), { maxLimit: 200 });
    expect(r).toEqual({ limit: 200, offset: 0 });
  });
});
