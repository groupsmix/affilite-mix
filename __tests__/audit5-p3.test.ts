import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * audit5-p3 assertions
 *
 * These tests pin the contracts established by the P3 deferred batch
 * (LOW-priority polish of the 2026-05-28(1) audit). They are
 * intentionally regex / string-shape checks rather than runtime
 * exercises because most P3 changes are documentation, comments, or
 * type-only refactors that don't have a meaningful runtime surface.
 *
 * Each test references the audit finding number so a future
 * contributor can trace the assertion back to its rationale.
 */

const REPO_ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("audit5-#10 — community route observability", () => {
  it("community/comments GET path emits logger.error + captureException", () => {
    const content = read("app/api/community/comments/route.ts");
    expect(content).toContain("logger.error");
    expect(content).toContain("captureException");
    expect(content).toContain("community.comments.list_failed");
    // The audit-#10 marker proves the comment-cleanup was intentional.
    expect(content).toContain("audit5-#10");
  });

  it("community/wrist-shots route emits logger.error + captureException for both 500 paths", () => {
    const content = read("app/api/community/wrist-shots/route.ts");
    expect(content).toContain("community.wrist_shots.list_failed");
    expect(content).toContain("community.wrist_shots.create_failed");
    expect((content.match(/captureException\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("does not silently catch DAL failures any more", () => {
    // The exact substring `// fail-open: best-effort` must NOT appear
    // in either community route. We pin both ways: substring and the
    // count, so a sneaky single occurrence still fails.
    for (const path of [
      "app/api/community/comments/route.ts",
      "app/api/community/wrist-shots/route.ts",
    ]) {
      const content = read(path);
      // A bare "fail-open: best-effort" comment (without an explicit
      // explanation) is forbidden in these two files now.
      const occurrences = (content.match(/\/\/\s*fail-open: best-effort\s*$/gm) ?? []).length;
      expect(occurrences, `${path} still uses bare fail-open comment`).toBe(0);
    }
  });
});

describe("audit5-#12 — requireAdminSession docstring + whitelist", () => {
  it("admin-guard.ts docstring lists the four call sites and the rename target", () => {
    const content = read("lib/admin-guard.ts");
    expect(content).toContain("requireAdminSessionBeforeSiteSelect");
    expect(content).toContain("Call sites whitelist");
    for (const callSite of [
      "app/api/admin/sites/active/route.ts",
      "app/api/admin/sites/route.ts",
      "app/api/admin/sites/select/route.ts",
      "app/api/admin/sites/stats/route.ts",
    ]) {
      expect(content, `whitelist must mention ${callSite}`).toContain(callSite);
    }
  });

  it("only the four whitelisted files import requireAdminSession from @/lib/admin-guard", () => {
    // Naive grep for `requireAdminSession` from the library; this
    // gives us the active set of importers. Note: the admin-dashboard
    // pages import a DIFFERENT requireAdminSession from
    // app/admin/(dashboard)/components/admin-guard, which is a UI
    // helper, so we only check imports of the library version.
    const whitelist = new Set([
      "app/api/admin/sites/active/route.ts",
      "app/api/admin/sites/route.ts",
      "app/api/admin/sites/select/route.ts",
      "app/api/admin/sites/stats/route.ts",
    ]);

    const { execSync } = require("node:child_process");
    const grep = execSync(
      `grep -rln "from \\"@/lib/admin-guard\\"" --include='*.ts' --include='*.tsx' app/`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    const importers = grep
      .split("\n")
      .filter(Boolean)
      .map((p: string) => p.replace(/^\.\//, ""));

    for (const importer of importers) {
      const content = read(importer);
      // Skip files that import other admin-guard exports (e.g.
      // requireAdmin, assertRole, etc) but not requireAdminSession.
      if (
        !/import\s*\{[^}]*\brequireAdminSession\b[^}]*\}\s*from\s*"@\/lib\/admin-guard"/.test(
          content,
        )
      ) {
        continue;
      }
      expect(
        whitelist.has(importer),
        `${importer} imports requireAdminSession but is not whitelisted in lib/admin-guard.ts`,
      ).toBe(true);
    }
  });
});

describe("audit5-#16 — TRUST_PROXY_HEADERS documentation", () => {
  it("docs/CLOUDFLARE.md has a TRUST_PROXY_HEADERS section", () => {
    const content = read("docs/CLOUDFLARE.md");
    expect(content).toContain("TRUST_PROXY_HEADERS");
    expect(content).toContain("audit5-#16");
    // The doc MUST explain both the "leave unset on Cloudflare" and
    // the "set true behind another reverse proxy" paths. Use a regex
    // that tolerates markdown bold (`**NOT** behind Cloudflare`).
    expect(content).toMatch(/NOT\*?\*?\s+behind\s+Cloudflare/);
    expect(content).toContain("cf-connecting-ip");
  });

  it("README.md surfaces the Security & Audit section", () => {
    const content = read("README.md");
    expect(content).toContain("## Security & Audit");
    expect(content).toContain("audit5-#40");
    expect(content).toContain("docs/audits");
  });
});

describe("audit5-#17 — admin product thumbnail eslint-disable rationale", () => {
  it("products-table.tsx has the audit5-#17 explanation comment", () => {
    const content = read("app/admin/(dashboard)/products/products-table.tsx");
    expect(content).toContain("audit5-#17");
    expect(content).toContain("next/image overhead not worth it");
    // The disable must scope to a specific rule, not blanket-disable.
    expect(content).toMatch(/eslint-disable-next-line\s+@next\/next\/no-img-element/);
  });
});

describe("audit5-#21 — sitemap stale-cache observability", () => {
  it("sitemap.ts uses the cachedAt envelope shape and STALE_CACHE_ALERT_THRESHOLD_SECONDS", () => {
    const content = read("app/sitemap.ts");
    expect(content).toContain("STALE_CACHE_ALERT_THRESHOLD_SECONDS");
    expect(content).toContain("cachedAt");
    expect(content).toContain("captureMessage");
    expect(content).toContain("sitemap.fallback_to_cache_stale");
    expect(content).toContain("audit5-#21");
  });

  it("sitemap.ts still handles legacy bare-array cache values gracefully", () => {
    const content = read("app/sitemap.ts");
    expect(content).toContain("Legacy bare-array shape");
    expect(content).toContain("ageSeconds: null");
  });
});

describe("audit5-#22 — robots.txt host header resolution", () => {
  it("robots.ts imports headers() and consults KNOWN_HOSTS before trusting the request Host", () => {
    const content = read("app/robots.ts");
    expect(content).toContain("import { headers }");
    expect(content).toContain("KNOWN_HOSTS");
    expect(content).toContain("resolveDomain");
    expect(content).toContain("audit5-#22");
    // Defence: the raw Host header must NEVER be echoed without the
    // KNOWN_HOSTS gate (otherwise an attacker sets Host: evil.example
    // and Googlebot fetches the wrong sitemap).
    expect(content).toContain("KNOWN_HOSTS.has(bareHost)");
  });

  it("robots.ts strips the port portion of the Host header before comparison", () => {
    const content = read("app/robots.ts");
    expect(content).toContain('split(":")[0]');
  });
});

describe("audit5-#26 — host-prefixed cookie inventory", () => {
  it("cookie-utils.ts exports HOST_PREFIXED_COOKIES with the CSRF entry", () => {
    const content = read("lib/cookie-utils.ts");
    expect(content).toContain("HOST_PREFIXED_COOKIES");
    expect(content).toContain("__Host-csrf");
    expect(content).toContain("__csrf");
    expect(content).toContain("audit5-#26");
  });

  it("the prod/dev csrf names in lib/csrf.ts match HOST_PREFIXED_COOKIES.csrf", () => {
    // We deliberately don't import the lib at runtime because csrf.ts
    // touches process.env.NODE_ENV at module-init time; static
    // pattern-matching is simpler and just as strong here.
    const csrf = read("lib/csrf.ts");
    const utils = read("lib/cookie-utils.ts");
    expect(csrf).toContain('"__Host-csrf" : "__csrf"');
    expect(utils).toContain('prod: "__Host-csrf"');
    expect(utils).toContain('dev: "__csrf"');
  });
});

describe("audit5-#31 — cookie-consent CMP language memoisation", () => {
  it("cookie-consent-cmp.tsx uses useMemo on the resolved language", () => {
    const content = read("app/(public)/components/cookie-consent-cmp.tsx");
    expect(content).toContain("useMemo");
    expect(content).toContain("resolvedLanguage");
    expect(content).toContain("audit5-#31");
    // The useEffect dep array must NOT carry the raw `language` prop
    // anymore (only `resolvedLanguage`); otherwise the memo is a no-op
    // for the CMP-init effect.
    const effectDepsMatch = content.match(/\}, \[([^\]]+)\]\);\s*\n\s*return null;/);
    expect(effectDepsMatch, "useEffect deps tuple not found").not.toBeNull();
    expect(effectDepsMatch?.[1]).toContain("resolvedLanguage");
  });
});

describe("audit5-#34 — HMAC key cache adoption", () => {
  it("app/api/track/click/route.ts uses the cached getOrDeriveHmacKey", () => {
    const content = read("app/api/track/click/route.ts");
    expect(content).toContain("getOrDeriveHmacKey");
    expect(content).toContain("audit5-#34");
    // The uncached `deriveHmacKey` must NOT be imported in the hot path.
    expect(content).not.toMatch(
      /import\s*\{[^}]*\bderiveHmacKey\b[^}]*\}\s*from\s*"@\/lib\/hmac-key"/,
    );
  });

  it("lib/hmac-key.ts still pre-warms the activity-cookie + signed-cookie keys at module load", () => {
    const content = read("lib/hmac-key.ts");
    expect(content).toContain('getOrDeriveHmacKey("activity-cookie"');
    expect(content).toContain('getOrDeriveHmacKey("signed-cookie"');
    expect(content).toContain("keyCache");
  });
});

describe("audit5-#35 — gitleaks pre-commit enforcement", () => {
  it(".husky/pre-commit hard-fails on missing gitleaks", () => {
    const content = read(".husky/pre-commit");
    expect(content).toContain("audit5-#35");
    expect(content).toMatch(/exit\s+1/);
    expect(content).toContain("GITLEAKS_DISABLE");
    // A regression that quietly continues without scanning is forbidden:
    // the previous "skipping local secret scan (CI will still block)"
    // wording must be gone.
    expect(content).not.toContain("CI will still block");
  });
});

describe("audit5-#40 — README security & audit section", () => {
  it("README links the audit-unfixed-items and tech-debt-followups docs", () => {
    const content = read("README.md");
    expect(content).toContain("docs/audits/audit-unfixed-items.md");
    expect(content).toContain("docs/audits/audit5-tech-debt-followups.md");
    expect(content).toContain("docs/runbooks/");
  });
});

describe("audit5 — deferred items are tracked, not silently dropped", () => {
  it("audit5-tech-debt-followups.md exists and documents #11, #12, #20", () => {
    const path = "docs/audits/audit5-tech-debt-followups.md";
    expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    const content = read(path);
    expect(content).toContain("audit5-#11");
    expect(content).toContain("audit5-#12");
    expect(content).toContain("audit5-#20");
    // Each P3-deferred entry must carry an owner + acceptance criterion;
    // otherwise this is just a TODO list, not tracked tech debt.
    expect(content).toContain("Owner:");
    expect(content).toContain("Acceptance criterion");
  });
});
