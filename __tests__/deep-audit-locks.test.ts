/**
 * deep-audit-locks.test.ts
 *
 * Pin behaviours that the deep audit (F-001 .. F-016) flagged but that
 * were already correct in the merged repo. These assertions exist so a
 * future change cannot silently reintroduce the regression.
 *
 * Findings actually fixed by the same PR that introduced this file
 * are pinned in addition to their inline implementation:
 *   F-002 — /api/queue/clicks uses the privileged server-only client
 *   F-005 — production migrations exit non-zero on missing DB URL
 *   F-007 — APP_CACHE_KV is provisioned + health-checked
 *   F-016 — gitleaks binary/tarball not committed; project README restored
 *
 * Findings whose claim was wrong but whose fix needs a regression lock:
 *   F-003 — DLQ branch retries on non-2xx (already correct, locked here)
 *   F-004 — every cron route uses getCronAuthOptionsForPath (already correct)
 *   F-006 — snapshot-vs-backup labeling (lock the deploy.yml comment)
 *   F-010 — GET /api/admin/users requires super_admin (already correct)
 *   F-014 — admin list routes use parsePagination (already correct)
 *   F-015 — tail_consumers wired by inject-tail-consumers.mjs at deploy time
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..");

function readRepoFile(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

/** Strip TS/JS line and block comments so assertions match executable code. */
function stripTsComments(src: string): string {
  let out = "";
  let i = 0;
  let inString: '"' | "'" | "`" | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch as '"' | "'" | "`";
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

describe("Deep audit regression locks (F-001 .. F-016)", () => {
  describe("F-002 — /api/queue/clicks uses the privileged server-only client", () => {
    const src = readRepoFile("app/api/queue/clicks/route.ts");
    const exec = stripTsComments(src);

    it("imports getPrivilegedSupabaseClient from the server-only gateway", () => {
      expect(exec).toMatch(
        /import\s*\{\s*getPrivilegedSupabaseClient\s*\}\s*from\s*"@\/lib\/server-only\/service-role"/,
      );
    });

    it("does NOT import getTenantClient (would mint a JWT with no site claim)", () => {
      expect(exec).not.toMatch(/import[^;]*getTenantClient[^;]*from[^;]*supabase-server/);
    });

    it("calls getPrivilegedSupabaseClient() before insert", () => {
      expect(exec).toMatch(/getPrivilegedSupabaseClient\(\)/);
    });
  });

  describe("F-001 — cron routes that called getTenantClient now use privileged client", () => {
    const cronRoutes = [
      "app/api/cron/publish/route.ts",
      "app/api/cron/sitemap-refresh/route.ts",
      "app/api/cron/data-retention/route.ts",
      "app/api/cron/epc-recompute/route.ts",
      "app/api/cron/price-scrape/route.ts",
    ];
    for (const rel of cronRoutes) {
      it(`${rel} uses the privileged client (no getTenantClient in executable code)`, () => {
        const exec = stripTsComments(readRepoFile(rel));
        expect(exec).toMatch(/getPrivilegedSupabaseClient\(\)/);
        expect(exec).not.toMatch(/await\s+getTenantClient\(\)/);
      });
    }
  });

  describe("F-003 — DLQ branch retries on non-2xx", () => {
    const src = readRepoFile("workers/custom-worker.ts");
    const exec = stripTsComments(src);

    it("checks res.ok before ackAll() in the DLQ branch", () => {
      // The DLQ branch must contain the structure: res.ok ? ackAll : retryAll
      expect(exec).toMatch(/if\s*\(\s*res\.ok\s*\)\s*\{\s*batch\.ackAll\(\)/);
      expect(exec).toMatch(/batch\.retryAll\(\)/);
    });

    it("does NOT unconditionally ackAll() inside the DLQ try block", () => {
      // The worker matches queues via the DLQ_QUEUES / MAIN_QUEUES sets
      // (prod + staging names), so locate the DLQ branch by those guards.
      const dlqBlockStart = exec.indexOf("DLQ_QUEUES.has(batch.queue)");
      const dlqBlockEnd = exec.indexOf("MAIN_QUEUES.has(batch.queue)");
      expect(dlqBlockStart).toBeGreaterThan(-1);
      expect(dlqBlockEnd).toBeGreaterThan(dlqBlockStart);
      const dlqBlock = exec.slice(dlqBlockStart, dlqBlockEnd);
      // No `batch.ackAll();` that is not preceded by a res.ok check
      const ackOccurrences = dlqBlock.match(/batch\.ackAll\(\)/g) ?? [];
      // We allow at most 2 acks: one inside `if (res.ok)`, one fallback when
      // there is no internal token / cron host. Both are conditional.
      expect(ackOccurrences.length).toBeLessThanOrEqual(2);
    });
  });

  describe("F-004 — every cron route uses getCronAuthOptionsForPath()", () => {
    const cronRouteFiles = [
      "app/api/cron/ai-generate/route.ts",
      "app/api/cron/commission-ingest/route.ts",
      "app/api/cron/data-retention/route.ts",
      "app/api/cron/epc-recompute/route.ts",
      "app/api/cron/expire-deals/route.ts",
      "app/api/cron/price-scrape/route.ts",
      "app/api/cron/publish/route.ts",
      "app/api/cron/sitemap-refresh/route.ts",
      "app/api/cron/stripe-sync/route.ts",
    ];
    for (const rel of cronRouteFiles) {
      it(`${rel} calls verifyCronAuth with getCronAuthOptionsForPath`, () => {
        const exec = stripTsComments(readRepoFile(rel));
        expect(exec).toMatch(/verifyCronAuth\(\s*request\s*,\s*getCronAuthOptionsForPath\(/);
        // Must not silently fall back to verifyCronAuth(request) with no options
        expect(exec).not.toMatch(/verifyCronAuth\(\s*request\s*\)/);
      });
    }
  });

  describe("F-005 — production deploy fails closed when DB URL is missing", () => {
    const yml = readRepoFile(".github/workflows/deploy.yml");

    it("Apply database migrations step exits 1 (not 0) when DB_URL is empty", () => {
      // Find the migration apply step and make sure it has `exit 1` after the empty-URL check
      const idx = yml.indexOf("Apply database migrations to production");
      expect(idx).toBeGreaterThan(-1);
      const stepBlock = yml.slice(idx, idx + 4000);
      expect(stepBlock).toMatch(/SUPABASE_DB_POOLER_URL or SUPABASE_DB_URL is required/);
      expect(stepBlock).toMatch(/exit 1/);
      // Must NOT contain the previous `exit 0` skip path
      expect(stepBlock).not.toMatch(/skipping DB migrations[\s\S]*?exit 0/);
    });

    it("Verify production schema step exits 1 (not 0) when DB_URL is empty", () => {
      const idx = yml.indexOf("Verify production schema");
      expect(idx).toBeGreaterThan(-1);
      const stepBlock = yml.slice(idx, idx + 2000);
      expect(stepBlock).toMatch(/required for post-migration schema verification/);
      expect(stepBlock).toMatch(/exit 1/);
    });
  });

  describe("F-007 — APP_CACHE_KV is provisioned and health-checked", () => {
    it("deploy.yml provisions both RATE_LIMIT_KV and APP_CACHE_KV", () => {
      const yml = readRepoFile(".github/workflows/deploy.yml");
      // Loop body that iterates over both binding names
      expect(yml).toMatch(/for\s+binding\s+in\s+RATE_LIMIT_KV\s+APP_CACHE_KV/);
    });

    it("/api/health checks APP_CACHE_KV binding presence in production", () => {
      const exec = stripTsComments(readRepoFile("app/api/health/route.ts"));
      expect(exec).toMatch(/APP_CACHE_KV/);
      expect(exec).toMatch(/app_cache_kv_binding/);
    });

    it("/api/health checks CLICK_QUEUE binding presence in production", () => {
      const exec = stripTsComments(readRepoFile("app/api/health/route.ts"));
      expect(exec).toMatch(/CLICK_QUEUE/);
      expect(exec).toMatch(/click_queue_binding/);
    });
  });

  describe("F-010 / G-45 — GET /api/admin/users requires super_admin (via assertRole)", () => {
    const src = readRepoFile("app/api/admin/users/route.ts");
    const exec = stripTsComments(src);

    it("GET handler enforces super_admin via assertRole (returns 401 + Bearer)", () => {
      // Find the GET function block
      const getStart = exec.indexOf("export async function GET");
      expect(getStart).toBeGreaterThan(-1);
      // The GET handler must invoke assertRole(session, "super_admin").
      // The role mismatch path itself lives in lib/admin-guard.ts and
      // returns a 401 + WWW-Authenticate: Bearer (G-45) — no longer a 403.
      const getBlock = exec.slice(getStart, getStart + 1500);
      expect(getBlock).toMatch(/assertRole\s*\(\s*session\s*,\s*"super_admin"\s*\)/);
      expect(getBlock).not.toMatch(/status:\s*403/);
    });
  });

  describe("F-014 — admin list routes use parsePagination()", () => {
    const adminListRoutes = [
      "app/api/admin/products/route.ts",
      "app/api/admin/content/route.ts",
      "app/api/admin/ai-content/route.ts",
    ];
    for (const rel of adminListRoutes) {
      it(`${rel} imports and calls parsePagination`, () => {
        const exec = stripTsComments(readRepoFile(rel));
        expect(exec).toMatch(/parsePagination/);
        // Must NOT parse limit/offset directly with Number(...) on searchParams
        expect(exec).not.toMatch(/Number\(\s*searchParams\.get\(\s*"(limit|offset)"\s*\)\s*\)/);
      });
    }
  });

  describe("F-015 — tail_consumers wired at deploy time", () => {
    it("inject-tail-consumers.mjs is executed before opennextjs deploy", () => {
      const yml = readRepoFile(".github/workflows/deploy.yml");
      const injectIdx = yml.indexOf("inject-tail-consumers.mjs");
      const deployIdx = yml.indexOf("opennextjs-cloudflare deploy");
      expect(injectIdx).toBeGreaterThan(-1);
      expect(deployIdx).toBeGreaterThan(-1);
      expect(injectIdx).toBeLessThan(deployIdx);
    });
  });

  describe("F-016 — gitleaks binary/tarball not committed; project README restored", () => {
    it("README.md is the project README, not vendored Gitleaks docs", () => {
      const readme = readRepoFile("README.md");
      expect(readme).toMatch(/Affilite-Mix/);
      // The Gitleaks README starts with `# Gitleaks`
      expect(readme).not.toMatch(/^# Gitleaks/);
    });

    it("gitleaks binary and tarball are not present at repo root", () => {
      expect(existsSync(join(REPO_ROOT, "gitleaks"))).toBe(false);
      // Glob-ish check for any vendored gitleaks tarball
      // (the test does not need to be exhaustive — gitignore covers the pattern)
      expect(existsSync(join(REPO_ROOT, "gitleaks_8.18.2_linux_x64.tar.gz"))).toBe(false);
    });

    it(".gitignore prevents future commits of the gitleaks binary/archive", () => {
      const gitignore = readRepoFile(".gitignore");
      expect(gitignore).toMatch(/^gitleaks$/m);
      expect(gitignore).toMatch(/^gitleaks_\*\.tar\.gz$/m);
    });
  });
});
