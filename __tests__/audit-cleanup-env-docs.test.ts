/**
 * audit-cleanup FR-C7-ENV-01 / FR-C9-01: regression locks for the
 * environment-variable documentation and the tsconfig target.
 *
 * Audit attachment: `affilite-mix-cleanup-audit(2).md`
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..");

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

describe("audit-cleanup FR-C7-ENV-01: missing env vars added to .env.example", () => {
  const envExample = readRepoFile(".env.example");
  const checkScript = readRepoFile("scripts", "check-env-docs.sh");

  it("HEALTH_DETAIL_BEARER is documented in .env.example with explanatory comments", () => {
    expect(envExample).toMatch(/^HEALTH_DETAIL_BEARER=/m);
    // The comment block above the var must reference the consuming route
    // so an operator provisioning the secret can find the code path.
    const block = envExample.match(/(#[^\n]*\n)+HEALTH_DETAIL_BEARER=/);
    expect(block, "HEALTH_DETAIL_BEARER must have an explanatory comment block").not.toBeNull();
    expect(block![0]).toMatch(/health/i);
  });

  it("JWT_SECRET_PREVIOUS is documented in .env.example with the 24h removal warning", () => {
    expect(envExample).toMatch(/^JWT_SECRET_PREVIOUS=/m);
    // FR-X-01: the rotation playbook must call out the 24h removal window
    // so on-call understands the secret is transient.
    const block = envExample.match(/(#[^\n]*\n)+JWT_SECRET_PREVIOUS=/);
    expect(block, "JWT_SECRET_PREVIOUS must have an explanatory comment block").not.toBeNull();
    expect(block![0]).toMatch(/24h/);
  });

  it("check-env-docs.sh tracks both vars in REQUIRED_VARS", () => {
    expect(checkScript).toMatch(/^\s*HEALTH_DETAIL_BEARER\s*$/m);
    expect(checkScript).toMatch(/^\s*JWT_SECRET_PREVIOUS\s*$/m);
  });
});

describe("audit-cleanup FR-C9-01: tsconfig target bumped to ES2022", () => {
  const tsconfig = readRepoFile("tsconfig.json");

  it("tsconfig.json target is ES2022 (was ES2017)", () => {
    expect(tsconfig).toMatch(/"target":\s*"ES2022"/);
    expect(tsconfig).not.toMatch(/"target":\s*"ES2017"/);
  });
});
