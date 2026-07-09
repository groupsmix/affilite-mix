/**
 * Guards the config/DB site drift detector (scripts/check-site-config-drift.ts).
 *
 * The two site sources of truth — config/sites/*.ts and the DB `sites` table —
 * must agree. This test exercises the pure `computeSiteDrift` diff across all
 * four drift categories plus the clean-match case, and asserts
 * `hasBlockingDrift` classifies hard vs soft (inactive) drift correctly.
 */
import { describe, it, expect } from "vitest";
import {
  computeSiteDrift,
  hasBlockingDrift,
  type ConfigSite,
} from "@/scripts/check-site-config-drift";

const config: ConfigSite[] = [
  { id: "ai-compared", domain: "compareai.site" },
  { id: "arabic-tools", domain: "arabictools.wristnerd.xyz" },
  { id: "crypto-tools", domain: "cryptoranked.xyz" },
  { id: "watch-tools", domain: "wristnerd.xyz" },
];

describe("computeSiteDrift", () => {
  it("reports no drift when config and DB match", () => {
    const db = config.map((s) => ({ id: s.id, domain: s.domain, is_active: true }));
    const report = computeSiteDrift(config, db);
    expect(report.missingInDb).toHaveLength(0);
    expect(report.missingInConfig).toHaveLength(0);
    expect(report.domainMismatch).toHaveLength(0);
    expect(report.activeMismatch).toHaveLength(0);
    expect(hasBlockingDrift(report)).toBe(false);
  });

  it("flags a site present in config but missing from the DB", () => {
    const db = config
      .filter((s) => s.id !== "watch-tools")
      .map((s) => ({ id: s.id, domain: s.domain, is_active: true }));
    const report = computeSiteDrift(config, db);
    expect(report.missingInDb).toEqual([{ id: "watch-tools", domain: "wristnerd.xyz" }]);
    expect(hasBlockingDrift(report)).toBe(true);
  });

  it("flags a site present in the DB but missing from config", () => {
    const db = [
      ...config.map((s) => ({ id: s.id, domain: s.domain, is_active: true })),
      { id: "ghost-site", domain: "ghost.xyz", is_active: true },
    ];
    const report = computeSiteDrift(config, db);
    expect(report.missingInConfig).toEqual([{ id: "ghost-site", domain: "ghost.xyz" }]);
    expect(hasBlockingDrift(report)).toBe(true);
  });

  it("flags a domain mismatch between config and DB", () => {
    const db = config.map((s) =>
      s.id === "arabic-tools"
        ? { id: s.id, domain: "typo.xyz", is_active: true }
        : { id: s.id, domain: s.domain, is_active: true },
    );
    const report = computeSiteDrift(config, db);
    expect(report.domainMismatch).toEqual([
      { id: "arabic-tools", configDomain: "arabictools.wristnerd.xyz", dbDomain: "typo.xyz" },
    ]);
    expect(hasBlockingDrift(report)).toBe(true);
  });

  it("treats a DB-inactive site as soft drift (warn) unless --strict", () => {
    const db = config.map((s) =>
      s.id === "crypto-tools"
        ? { id: s.id, domain: s.domain, is_active: false }
        : { id: s.id, domain: s.domain, is_active: true },
    );
    const report = computeSiteDrift(config, db);
    expect(report.activeMismatch).toEqual([
      { id: "crypto-tools", configActive: true, dbActive: false },
    ]);
    // Not blocking by default...
    expect(hasBlockingDrift(report)).toBe(false);
    // ...but blocking under strict mode.
    expect(hasBlockingDrift(report, true)).toBe(true);
  });

  it("handles a null DB domain as a mismatch", () => {
    const db = config.map((s) =>
      s.id === "ai-compared"
        ? { id: s.id, domain: null, is_active: true }
        : { id: s.id, domain: s.domain, is_active: true },
    );
    const report = computeSiteDrift(config, db);
    expect(report.domainMismatch).toEqual([
      { id: "ai-compared", configDomain: "compareai.site", dbDomain: null },
    ]);
  });
});
