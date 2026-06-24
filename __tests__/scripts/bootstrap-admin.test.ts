/**
 * Tests for the admin bootstrap path (admin-launch-blockers task 11.1,
 * F-015 / F-016). The bootstrap MUST persist the super_admin into the SAME
 * global `admin_users` table the Admin Users list reads from and the create
 * flow writes to — otherwise the list is always empty even though login works.
 *
 * These tests exercise the real `bootstrapAdmin` against an in-memory fake of
 * the service-role client whose query chain mirrors the calls the function
 * builds, plus the real `hashPassword` / `verifyPassword` (no mocks), so the
 * persisted credential is verifiable.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapAdmin } from "@/scripts/bootstrap-admin";
import { verifyPassword } from "@/lib/password";

interface Row {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  password_hash?: string;
  name?: string;
}

/**
 * Minimal in-memory `admin_users` fake. Supports exactly the query shapes
 * `bootstrapAdmin` builds:
 *   select(...).eq("email", e).maybeSingle()
 *   insert(payload).select(...).single()
 *   update(payload).eq("id", id).select(...).single()
 */
function makeFakeClient(initial: Row[] = []) {
  const store = new Map<string, Row>();
  for (const r of initial) store.set(r.id, { ...r });
  let idSeq = initial.length;

  function from(_table: string) {
    const builder: any = {
      _op: null as null | "select" | "update" | "insert",
      _payload: undefined as Record<string, unknown> | undefined,
      _filters: {} as Record<string, unknown>,
      select() {
        if (!this._op) this._op = "select";
        return this;
      },
      insert(payload: Record<string, unknown>) {
        this._op = "insert";
        this._payload = payload;
        return this;
      },
      update(payload: Record<string, unknown>) {
        this._op = "update";
        this._payload = payload;
        return this;
      },
      eq(col: string, val: unknown) {
        this._filters[col] = val;
        return this;
      },
      maybeSingle() {
        return this._run(true);
      },
      single() {
        return this._run(false);
      },
      _run(allowNull: boolean) {
        const match = (r: Row) =>
          Object.entries(this._filters).every(
            ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
          );

        if (this._op === "select") {
          const found = [...store.values()].find(match) ?? null;
          if (!found && !allowNull) {
            return Promise.resolve({ data: null, error: { message: "no rows" } });
          }
          return Promise.resolve({ data: found, error: null });
        }
        if (this._op === "insert") {
          const id = `id-${++idSeq}`;
          const row: Row = { id, ...(this._payload as object) } as Row;
          store.set(id, row);
          return Promise.resolve({ data: row, error: null });
        }
        if (this._op === "update") {
          const target = [...store.values()].find(match);
          if (!target) return Promise.resolve({ data: null, error: { message: "no rows" } });
          Object.assign(target, this._payload);
          return Promise.resolve({ data: target, error: null });
        }
        return Promise.resolve({ data: null, error: { message: "unknown op" } });
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, store };
}

describe("bootstrapAdmin — persists the super_admin to admin_users (F-015/F-016, task 11.1)", () => {
  it("inserts a new ACTIVE super_admin into admin_users when none exists", async () => {
    const { client, store } = makeFakeClient([]);

    const result = await bootstrapAdmin(client, {
      email: "founder@admin.local",
      password: "C0rrect-Horse-Battery-Staple!",
    });

    expect(result.created).toBe(true);
    expect(result.role).toBe("super_admin");

    // The row is persisted to the SAME table listAdminUsers reads from.
    const persisted = [...store.values()];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.email).toBe("founder@admin.local");
    expect(persisted[0]!.role).toBe("super_admin");
    expect(persisted[0]!.is_active).toBe(true);
  });

  it("stores a verifiable bcrypt hash, never the plaintext password", async () => {
    const { client, store } = makeFakeClient([]);
    const password = "C0rrect-Horse-Battery-Staple!";

    await bootstrapAdmin(client, { email: "founder@admin.local", password });

    const row = [...store.values()][0]!;
    expect(row.password_hash).toBeDefined();
    expect(row.password_hash).not.toBe(password);
    const { valid } = await verifyPassword(password, row.password_hash!);
    expect(valid).toBe(true);
  });

  it("normalises the email to lowercase + trimmed", async () => {
    const { client, store } = makeFakeClient([]);

    await bootstrapAdmin(client, {
      email: "  Founder@Admin.LOCAL  ",
      password: "C0rrect-Horse-Battery-Staple!",
    });

    expect([...store.values()][0]!.email).toBe("founder@admin.local");
  });

  it("is idempotent: re-running re-activates and re-elevates the existing account (no duplicate)", async () => {
    const { client, store } = makeFakeClient([
      {
        id: "existing-1",
        email: "founder@admin.local",
        role: "admin",
        is_active: false,
        password_hash: "$sha256$stale",
      },
    ]);

    const result = await bootstrapAdmin(client, {
      email: "founder@admin.local",
      password: "C0rrect-Horse-Battery-Staple!",
    });

    expect(result.created).toBe(false);
    expect(result.id).toBe("existing-1");
    expect(store.size).toBe(1); // no duplicate row created
    const row = store.get("existing-1")!;
    expect(row.role).toBe("super_admin");
    expect(row.is_active).toBe(true);
    const { valid } = await verifyPassword("C0rrect-Horse-Battery-Staple!", row.password_hash!);
    expect(valid).toBe(true);
  });

  it("rejects a missing email", async () => {
    const { client } = makeFakeClient([]);
    await expect(
      bootstrapAdmin(client, { email: "   ", password: "C0rrect-Horse-Battery-Staple!" }),
    ).rejects.toThrow(/ADMIN_BOOTSTRAP_EMAIL/);
  });

  it("rejects a missing password", async () => {
    const { client } = makeFakeClient([]);
    await expect(
      bootstrapAdmin(client, { email: "founder@admin.local", password: "" }),
    ).rejects.toThrow(/ADMIN_BOOTSTRAP_PASSWORD/);
  });

  it("property: for any valid credential the bootstrapped account is persisted as an active super_admin with a verifiable hash", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            fc
              .string({ minLength: 1, maxLength: 12 })
              .map((s) => s.replace(/[^a-z0-9]/gi, "x") || "u"),
            fc.constantFrom("admin.local", "example.com", "test.io"),
          )
          .map(([local, domain]) => `${local}@${domain}`),
        fc.string({ minLength: 8, maxLength: 40 }),
        async (email, password) => {
          const { client, store } = makeFakeClient([]);

          const result = await bootstrapAdmin(client, { email, password });

          expect(result.role).toBe("super_admin");
          expect(store.size).toBe(1);
          const row = [...store.values()][0]!;
          expect(row.email).toBe(email.trim().toLowerCase());
          expect(row.role).toBe("super_admin");
          expect(row.is_active).toBe(true);
          const { valid } = await verifyPassword(password, row.password_hash!);
          expect(valid).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  }, 30000);
});
