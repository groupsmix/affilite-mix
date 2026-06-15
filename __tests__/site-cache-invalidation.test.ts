/**
 * S9-C3 regression: invalidateSiteCache must purge middleware KV entries.
 *
 * The middleware stores `site-domain:<hostname>` entries in APP_CACHE_KV.
 * If invalidateSiteCache() only calls revalidateTag("sites"), stale KV
 * entries survive for up to 60s — creating a cross-tenant data-leak
 * window during domain migrations.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Site cache invalidation (S9-C3 / #607)", () => {
  const sitesPath = path.resolve("lib/dal/sites.ts");
  const source = fs.readFileSync(sitesPath, "utf8");

  it("imports getAppCacheKV for KV invalidation", () => {
    expect(source).toMatch(/getAppCacheKV/);
  });

  it("deletes site-domain: KV keys during invalidation", () => {
    expect(source).toMatch(/site-domain:/);
  });

  it("deletes site-domain-miss: negative-cache keys during invalidation", () => {
    expect(source).toMatch(/site-domain-miss:/);
  });

  it("invalidateSiteCache accepts domain parameters", () => {
    expect(source).toMatch(/invalidateSiteCache\(.*oldDomain.*newDomain/s);
  });

  it("updateSite captures old domain before updating", () => {
    const updateBlock = source.slice(source.indexOf("export async function updateSite"));
    expect(updateBlock).toMatch(/oldDomain/);
    expect(updateBlock).toMatch(/getSiteRowById/);
  });

  it("createSite invalidates the newly registered domain explicitly", () => {
    const createBlock = source.slice(
      source.indexOf("export async function createSite"),
      source.indexOf("export async function updateSite"),
    );
    expect(createBlock).toMatch(/invalidateSiteCache\(undefined,\s*input\.domain\)/);
  });

  it("deleteSite captures the existing domain before invalidation", () => {
    const deleteBlock = source.slice(source.indexOf("export async function deleteSite"));
    expect(deleteBlock).toMatch(/const existing = await getSiteRowById/);
    expect(deleteBlock).toMatch(/invalidateSiteCache\(existing\?\.domain/);
  });
});
