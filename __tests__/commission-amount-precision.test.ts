import { describe, it, expect } from "vitest";
import { validateCommissionReport, toStoredAmount } from "@/lib/commission-validation";
import { sumCommissions } from "@/app/api/cron/epc-recompute/aggregation";

function report(overrides: Record<string, unknown> = {}) {
  return {
    tracking_key: "site-key",
    network: "cj",
    commission_amount: 12.34,
    event_date: "2026-01-15",
    ...overrides,
  };
}

describe("commission amount precision", () => {
  it("stores the value PostgreSQL would store for extra decimals", () => {
    const parsed = validateCommissionReport(report({ commission_amount: 1.005 }));
    expect(parsed.errors).toBeNull();
    expect(parsed.data?.commission_amount).toBe(1.01);
  });

  it("normalises sale_amount the same way", () => {
    const parsed = validateCommissionReport(report({ sale_amount: 99.999 }));
    expect(parsed.data?.sale_amount).toBe(100);
  });

  it("rejects a negative payout instead of failing the DB constraint", () => {
    const parsed = validateCommissionReport(report({ commission_amount: -1 }));
    expect(parsed.data).toBeNull();
    expect(parsed.errors?.join(" ")).toMatch(/commission_amount must be >= 0/);
  });

  it("rejects an amount that does not fit NUMERIC(12,2)", () => {
    const parsed = validateCommissionReport(report({ commission_amount: 1e11 }));
    expect(parsed.data).toBeNull();
    expect(parsed.errors?.join(" ")).toMatch(/NUMERIC\(12,2\)/);
  });

  it("keeps a plain two-decimal amount untouched", () => {
    expect(toStoredAmount(12.34)).toBe(12.34);
    expect(validateCommissionReport(report()).data?.commission_amount).toBe(12.34);
  });
});

describe("sumCommissions", () => {
  it("does not accumulate binary-float drift", () => {
    const commissions = Array.from({ length: 10 }, () => ({ commission_amount: 0.1 }));
    expect(sumCommissions(commissions)).toBe(1);
    expect(sumCommissions([{ commission_amount: 0.1 }, { commission_amount: 0.2 }])).toBe(0.3);
  });

  it("treats missing amounts as zero", () => {
    expect(sumCommissions([{ commission_amount: null }, {}])).toBe(0);
    expect(sumCommissions(null)).toBe(0);
  });
});
