/**
 * F-015: the production shared-cron-secret bypass
 * (`CRON_ALLOW_SHARED_FALLBACK_IN_PROD`) must never be committed in a truthy
 * state. The flag is a temporary rollout aid; if it lands enabled in
 * `.env.example`, the Wrangler config, or the deploy workflow, every cron route
 * silently degrades to a single shared secret in production (the exact posture
 * F-006 closed).
 *
 * This is the CI guard the audit asked for: it scans committed config —
 * ignoring comments — and fails if the flag is assigned a truthy value.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const FLAG = "CRON_ALLOW_SHARED_FALLBACK_IN_PROD";
const TRUTHY = new RegExp(`${FLAG}\\s*[:=]\\s*"?(?:1|true|yes|on)\\b`, "i");

// Files where the flag could realistically be (mis)committed.
const CONFIG_FILES = [
  ".env.example",
  "wrangler.jsonc",
  "wrangler.toml",
  ".github/workflows/deploy.yml",
];

/** Drop the comment portion of a line (`#` for env/yaml, `//` for jsonc). */
function stripComment(line: string): string {
  let l = line;
  const hash = l.indexOf("#");
  if (hash >= 0) l = l.slice(0, hash);
  const slashes = l.indexOf("//");
  if (slashes >= 0) l = l.slice(0, slashes);
  return l;
}

describe("F-015: cron shared-fallback prod-bypass flag is never committed enabled", () => {
  it.each(CONFIG_FILES)("%s does not enable the flag (outside comments)", (rel) => {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) return; // file optional — nothing to check
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = stripComment(line);
      expect(
        TRUTHY.test(code),
        `${rel}:${i + 1} sets ${FLAG} to a truthy value in committed config`,
      ).toBe(false);
    });
  });

  it(".env.example documents the flag and leaves it disabled by default", () => {
    const env = readFileSync(join(repoRoot, ".env.example"), "utf8");
    // Present, so operators know it exists…
    expect(env).toMatch(new RegExp(`^${FLAG}=`, "m"));
    // …and empty (disabled) by default.
    expect(env).toMatch(new RegExp(`^${FLAG}=[ \\t]*$`, "m"));
  });
});
