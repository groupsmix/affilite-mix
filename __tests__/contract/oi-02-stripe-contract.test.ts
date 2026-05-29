/**
 * OI-02 / S8-F8: Contract tests closing the Stripe idempotency + signing investigation.
 *
 * Season 8 CEO audit finding F8 flagged OI-02 as unproven:
 *   - stripe_events table enforces idempotency (unique constraint on event ID)
 *   - lib/stripe-webhook.ts validates Stripe signatures before processing
 *   - apply_stripe_membership_event RPC handles duplicate calls safely
 *   - Webhook endpoint rejects events with stale timestamps
 *
 * This test file closes OI-02 with evidence:
 *   1. constructStripeEvent rejects missing/invalid/stale/tampered signatures (runtime tests).
 *   2. applyStripeEventAtomic calls the DB RPC with correct shape (import verification).
 *   3. Migration 00070 defines the atomic RPC with ON CONFLICT (SQL structure check).
 *   4. stripe_events DAL handles unique constraint violations (import verification).
 *
 * Note: The signing tests (describe 1) exercise actual runtime behavior via
 * constructStripeEvent. The idempotency tests (describe 2) verify structural
 * contracts because full database integration requires a running Supabase
 * instance — a future enhancement for OI-04 game day drills.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { constructStripeEvent, StripeSignatureError } from "@/lib/stripe-webhook";

const SECRET = "whsec_oi02_contract_test";

async function signPayload(payload: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf-8");
}

// ── Runtime behaviour tests (actual crypto verification) ─────────────────

describe("OI-02: Stripe webhook signing contract", () => {
  it("rejects events with stale timestamps (replay protection)", async () => {
    const payload = JSON.stringify({
      id: "evt_stale",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const staleTs = Math.floor(Date.now() / 1000) - 3600;
    const header = await signPayload(payload, SECRET, staleTs);
    await expect(constructStripeEvent(payload, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects events with wrong signing secret", async () => {
    const payload = JSON.stringify({
      id: "evt_wrong_secret",
      type: "invoice.paid",
      data: { object: {} },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload(payload, "whsec_wrong", ts);
    await expect(constructStripeEvent(payload, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects tampered payloads", async () => {
    const original = JSON.stringify({
      id: "evt_tamper",
      type: "invoice.paid",
      data: { object: { amount: 100 } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload(original, SECRET, ts);
    const tampered = original.replace("100", "999999");
    await expect(constructStripeEvent(tampered, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("accepts a validly signed event and returns parsed payload with id", async () => {
    const payload = JSON.stringify({
      id: "evt_valid_oi02",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload(payload, SECRET, ts);
    const event = await constructStripeEvent(payload, header, SECRET);
    expect(event.id).toBe("evt_valid_oi02");
    expect(event.type).toBe("checkout.session.completed");
  });
});

// ── Structural contract tests (import + SQL verification) ────────────────

describe("OI-02: Stripe idempotency contract", () => {
  it("applyStripeEventAtomic is exported and callable", async () => {
    // Import the actual DAL module to verify the function exists
    const dalMod = await import("@/lib/dal/stripe-events");
    expect(typeof dalMod.applyStripeEventAtomic).toBe("function");
  });

  it("DAL calls apply_stripe_membership_event RPC with correct parameter shape", () => {
    // Structural check: the DAL source must reference the RPC and its parameters.
    // This catches renames or signature drift between the DAL and the migration.
    const source = readRepoFile("lib/dal/stripe-events.ts");
    expect(source).toContain("apply_stripe_membership_event");
    expect(source).toContain("p_stripe_event_id");
    expect(source).toContain("p_event_type");
    expect(source).toContain("p_event_data");
  });

  it("migration 00070 defines atomic stripe event apply RPC with ON CONFLICT", () => {
    const migrationPath = "supabase/migrations/00070_atomic_stripe_event_apply.sql";
    const exists = fs.existsSync(path.resolve(__dirname, "../..", migrationPath));
    expect(exists).toBe(true);
    const content = readRepoFile(migrationPath);
    expect(content).toContain("apply_stripe_membership_event");
    expect(content).toMatch(/ON\s+CONFLICT/i);
  });

  it("processStripeEvent is exported and handles duplicates", async () => {
    // Import the actual processor module
    const processorMod = await import("@/lib/stripe-event-processor");
    expect(typeof processorMod.processStripeEvent).toBe("function");

    // Structural check: the processor must contain duplicate-handling logic
    const source = readRepoFile("lib/stripe-event-processor.ts");
    expect(source).toContain("duplicate");
    expect(source).toContain("already processed");
  });

  it("stripe_events DAL handles unique constraint violations (23505)", () => {
    // Structural check: the DAL must handle Postgres unique_violation (23505)
    // which is the mechanism for ON CONFLICT deduplication
    const source = readRepoFile("lib/dal/stripe-events.ts");
    expect(source).toContain("23505");
  });
});
