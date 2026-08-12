/**
 * G-26 — lock for the click-DLQ replay tooling and runbook.
 *
 * The audit explicitly called out that `wrangler.jsonc` declares
 * `click-tracking-dlq` but the repo had neither replay tooling nor an
 * operational runbook.  This file pins the contract that closes that
 * gap so a future refactor cannot silently delete either artifact.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(repoRoot, p), "utf8");

describe("G-26 click DLQ replay tooling", () => {
  it("scripts/drain-dlq.ts exists", () => {
    expect(existsSync(join(repoRoot, "scripts/drain-dlq.ts"))).toBe(true);
  });

  it("drain-dlq.ts implements the documented subcommands", () => {
    const src = read("scripts/drain-dlq.ts");
    // Each subcommand is referenced both in the dispatch and in the
    // CLI parser; pin all three so renaming or removing one fails CI.
    expect(src).toMatch(/command\s*===\s*"list"/);
    expect(src).toMatch(/command\s*===\s*"replay"/);
    expect(src).toMatch(/command\s*===\s*"purge"/);
    // Replay must be safe-by-default — dry-run flag plumbing.
    expect(src).toMatch(/--dry-run/);
    // Replay must reuse the production HMAC signing helper rather
    // than rolling a new auth scheme that drifts from the route.
    expect(src).toMatch(/from "\.\.\/lib\/internal-hmac"/);
    expect(src).toMatch(/signInternalRequest/);
    // Reads from the durable Postgres sink, not the Cloudflare Queue REST API.
    expect(src).toMatch(/from\("click_failures"\)/);
    expect(src).toContain("--target or APP_URL is required for `replay`.");
    expect(src).not.toContain("http://localhost:3000");
  });

  it("npm script `drain-dlq` is wired up", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["drain-dlq"]).toBe("tsx scripts/drain-dlq.ts");
  });

  it("docs/runbooks/click-dlq.md exists and references the script", () => {
    const path = "docs/runbooks/click-dlq.md";
    expect(existsSync(join(repoRoot, path))).toBe(true);
    const md = read(path);
    expect(md).toMatch(/click-tracking-dlq/);
    expect(md).toMatch(/click_failures/);
    expect(md).toMatch(/npm run drain-dlq -- list/);
    expect(md).toMatch(/npm run drain-dlq -- replay/);
    expect(md).toMatch(/npm run drain-dlq -- purge/);
  });
});
