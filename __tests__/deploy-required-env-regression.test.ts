/**
 * INCIDENT 2026-06-10 regression guard.
 *
 * `AFFILIATE_DOMAIN_ENFORCEMENT` is hard-required at production startup
 * (lib/server-env.ts, R-01): when it is missing, `instrumentation.ts`
 * throws and the Worker answers 500 to every request on every tenant.
 * That is exactly what happened on 2026-06-10 (~21:21 UTC → ~04:10 UTC):
 * the variable had only ever been set manually on the Worker, an
 * out-of-band script update + deploy wiped it, and production was down
 * for ~7 hours with alerting unconfigured.
 *
 * This test pins the invariant that closed the incident: every deploy
 * must (re-)push the variable, so a Worker can never boot without it.
 * Same idiom as the NEW-001 cron-secret assertions in
 * `__tests__/cron-registry.test.ts`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const DEPLOY_YML = path.join(REPO_ROOT, ".github", "workflows", "deploy.yml");

describe("INCIDENT 2026-06-10: deploy pushes hard-required startup env", () => {
  const deploy = fs.readFileSync(DEPLOY_YML, "utf8");

  it("deploy.yml pushes AFFILIATE_DOMAIN_ENFORCEMENT to the main worker", () => {
    expect(deploy).toMatch(/secret put AFFILIATE_DOMAIN_ENFORCEMENT\s+--name affilite-mix/);
  });

  it("the pushed value is the literal 'strict' (only valid production value)", () => {
    expect(deploy).toMatch(
      /echo "strict"\s*\|\s*npx --yes wrangler@\$\{WRANGLER_VERSION\} secret put AFFILIATE_DOMAIN_ENFORCEMENT/,
    );
  });

  it("lib/server-env.ts still hard-requires the variable in production", () => {
    // If this assertion ever fails, the requirement moved or was removed —
    // update both this test and the deploy.yml push line together.
    const serverEnv = fs.readFileSync(path.join(REPO_ROOT, "lib", "server-env.ts"), "utf8");
    expect(serverEnv).toContain('"AFFILIATE_DOMAIN_ENFORCEMENT"');
  });
});
