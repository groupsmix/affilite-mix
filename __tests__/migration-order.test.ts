/**
 * Guards against new migration prefix collisions (audit item R-5).
 *
 * Pre-existing collisions are documented and grandfathered (00038, 00039,
 * 00070); any *new* duplicate prefix should fail CI before merge.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("supabase migration filenames", () => {
  it("does not introduce any duplicate numeric prefixes", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const prefixes: Record<string, string[]> = {};
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".sql") || file.endsWith("-down.sql")) continue;
      const match = /^(\d{5,})_/.exec(file);
      if (!match) continue;
      const prefix = match[1];
      (prefixes[prefix] ??= []).push(file);
    }
    const collisions = Object.entries(prefixes).filter(([, files]) => files.length > 1);
    expect(collisions, `Migration prefix collisions: ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it("every forward migration has a paired down file when its name suggests a destructive change", () => {
    // Convenience guard: anything whose name contains 'drop', 'remove',
    // 'harden', 'tenant_isolation', or 'rls' should ship a -down.sql.
    const dir = join(process.cwd(), "supabase", "migrations");
    const all = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const forward = all.filter((f) => !f.endsWith("-down.sql"));
    const dangerous = forward.filter((f) => /(drop|remove|harden|tenant_isolation|rls)/i.test(f));
    const missing = dangerous.filter((f) => {
      const expected = f.replace(/\.sql$/, "-down.sql");
      return !all.includes(expected);
    });
    expect(missing, `Migrations missing a down counterpart: ${JSON.stringify(missing)}`).toEqual(
      [],
    );
  });
});
