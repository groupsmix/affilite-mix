/**
 * F-ARCH-03 (#611): Regression tests for unsafeNoSiteFilter ESLint guard.
 *
 * Verifies that the ESLint config bans unsafeNoSiteFilter() in regular
 * app routes while allowing it in privileged contexts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const eslintConfig = fs.readFileSync(path.resolve(__dirname, "../eslint.config.mjs"), "utf-8");

describe("F-ARCH-03 (#611): unsafeNoSiteFilter ESLint guard", () => {
  it("defines the unsafeNoSiteFilterBan constant", () => {
    expect(eslintConfig).toContain("unsafeNoSiteFilterBan");
  });

  it("bans unsafeNoSiteFilter via no-restricted-syntax selector", () => {
    expect(eslintConfig).toContain("CallExpression[callee.property.name='unsafeNoSiteFilter']");
  });

  it("applies the ban to app/**/*.ts files", () => {
    expect(eslintConfig).toContain("unsafeNoSiteFilterBan");
    // The F-ARCH-03 block must reference app files
    expect(eslintConfig).toMatch(/F-ARCH-03[\s\S]*?files:.*app\/\*\*\/\*\.ts/);
  });

  it("excludes privileged routes from the ban via ignores", () => {
    // Extract the F-ARCH-03 block
    const archBlock = eslintConfig.slice(
      eslintConfig.indexOf("F-ARCH-03"),
      eslintConfig.indexOf("unsafeNoSiteFilterBan,") + 30,
    );
    expect(archBlock).toContain("app/api/cron/**");
    expect(archBlock).toContain("app/api/queue/**");
    expect(archBlock).toContain("app/api/internal/**");
    expect(archBlock).toContain("app/api/membership/webhook/**");
    expect(archBlock).toContain("app/api/admin/**");
    expect(archBlock).toContain("app/api/auth/**");
  });

  it("error message references issue #611", () => {
    expect(eslintConfig).toContain("(#611)");
  });

  it("error message explains the bypass is for DAL/privileged contexts only", () => {
    expect(eslintConfig).toContain("lib/dal/*");
    expect(eslintConfig).toContain("lib/server-only/*");
  });
});
