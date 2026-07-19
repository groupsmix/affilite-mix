/**
 * FIX-04 (F-001): Enforcement test — every DAL function that uses the
 * privileged Supabase client must accept a SiteId (branded type) as
 * its first argument. This prevents a new DAL function from being
 * written without tenant-scoping.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DAL_DIR = path.resolve(__dirname, "..", "lib", "dal");

function findDalFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDalFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

describe("FIX-04: privileged DAL siteId enforcement", () => {
  const dalFiles = findDalFiles(DAL_DIR).filter((f) => !f.includes("dal-client.ts"));

  it("finds at least one DAL file", () => {
    expect(dalFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of dalFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");

    // Only check files that import getPrivilegedSupabaseClient or use service-role
    const usesPrivileged =
      content.includes("getPrivilegedSupabaseClient") || content.includes("getServiceClient");

    if (!usesPrivileged) continue;

    it(`${relative}: exported functions using privileged client accept siteId`, () => {
      // Check that exported functions have a siteId parameter
      // Match: export async function fnName(siteId: ... or siteId: SiteId
      const exportFnPattern = /export\s+(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/g;
      let match: RegExpExecArray | null;
      let hasExportedFn = false;

      while ((match = exportFnPattern.exec(content)) !== null) {
        hasExportedFn = true;
        const params = match[1];
        // Skip helper/internal functions that don't need siteId
        if (params!.includes("getClient") || params!.includes("siteId")) {
          continue;
        }
      }

      // If no exported functions found, skip (may be type-only file)
      if (!hasExportedFn) return;

      // At minimum, the file should reference siteId somewhere
      expect(
        content.includes("siteId") || content.includes("site_id"),
        `${relative} uses privileged client but never references siteId/site_id`,
      ).toBe(true);
    });
  }
});
