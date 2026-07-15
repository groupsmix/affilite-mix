/**
 * F-3: guard the documented backup restore order (docs/backup-strategy.md).
 *
 * Per-table `pg_dump --data-only` dumps restored out of dependency order violate
 * foreign keys. These tests assert the canonical restore order always restores
 * parents before children and that the transactional wrapper defers + revalidates
 * FK enforcement, so the documented procedure stays safe as the schema evolves.
 */
import { describe, it, expect } from "vitest";
import {
  BACKUP_TABLES,
  FK_DEPENDENCIES,
  RESTORE_ORDER,
  computeRestoreOrder,
  assertRestoreOrderRespectsFks,
  buildRestoreSql,
} from "@/scripts/backup-restore-order";

describe("backup restore order (F-3)", () => {
  it("restores every parent table before its children", () => {
    expect(assertRestoreOrderRespectsFks(RESTORE_ORDER)).toBe(true);
  });

  it("covers exactly the backed-up table set", () => {
    expect([...RESTORE_ORDER].sort()).toEqual([...BACKUP_TABLES].sort());
  });

  it("places root tables (no FK parents) first", () => {
    expect(RESTORE_ORDER[0]).toBe("sites");
    // content_products depends on both content and products, so it must be last
    // among the content graph.
    const idx = (t: string) => RESTORE_ORDER.indexOf(t as (typeof RESTORE_ORDER)[number]);
    expect(idx("content_products")).toBeGreaterThan(idx("content"));
    expect(idx("content_products")).toBeGreaterThan(idx("products"));
    expect(idx("products")).toBeGreaterThan(idx("categories"));
    expect(idx("audit_log")).toBeGreaterThan(idx("admin_users"));
  });

  it("computeRestoreOrder is deterministic and matches RESTORE_ORDER", () => {
    expect(computeRestoreOrder()).toEqual([...RESTORE_ORDER]);
  });

  it("rejects an order that restores a child before its parent", () => {
    // Move content_products ahead of its parents.
    const bad = ["content_products", ...RESTORE_ORDER.filter((t) => t !== "content_products")];
    expect(() => assertRestoreOrderRespectsFks(bad)).toThrow(/restored before its parent/);
  });

  it("rejects an order that omits a backed-up table", () => {
    const bad = RESTORE_ORDER.filter((t) => t !== "audit_log");
    expect(() => assertRestoreOrderRespectsFks(bad)).toThrow(/omits backed-up tables/);
  });

  it("FK dependency map only references tables in the backup set", () => {
    const known = new Set<string>(BACKUP_TABLES);
    for (const [table, parents] of Object.entries(FK_DEPENDENCIES)) {
      expect(known.has(table)).toBe(true);
      for (const parent of parents) expect(known.has(parent)).toBe(true);
    }
  });

  it("emits a transactional restore that defers and revalidates FK enforcement", () => {
    const sql = buildRestoreSql("backups/20260101");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET session_replication_role = replica;");
    expect(sql).toContain("SET session_replication_role = origin;");
    expect(sql).toContain("COMMIT;");
    // Parent restore command appears before the child restore command.
    expect(sql.indexOf("--table=products")).toBeLessThan(sql.indexOf("--table=content_products"));
  });
});
