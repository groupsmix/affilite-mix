/**
 * Regression tests for the typed Cloudflare Worker binding accessors in
 * `lib/runtime-env.ts`.
 *
 * These accessors replaced ~10 hand-rolled `(process.env as Record<string,
 * unknown>).BINDING_NAME` casts spread across health checks, cron locks,
 * cron liveness, the click queue, and the data-retention cron. The casts
 * were typo-prone (one mismatched name silently disabled a binding in
 * production) and erased the binding shape, so a malformed object could
 * pass the `typeof === "object"` check and crash later.
 *
 * Node's real `process.env` is a Proxy that coerces non-string values to
 * strings, so we cannot drop a fake KV object onto `process.env.X` in
 * tests. We instead:
 *   - Test the *absence* path (binding undefined → returns null).
 *   - Test the *typo'd binding* path (binding is a string from a misset
 *     env var → returns null because string lacks .get/.put).
 *   - Source-scan `lib/runtime-env.ts` to lock the env-var names so a
 *     typo (e.g. `APP_CHACE_KV`) in the accessor body would fail CI.
 *   - Source-scan to confirm each accessor checks the correct duck-typed
 *     method names (get/put for KV, send for Queue, etc).
 *   - Confirm the ESLint rule blocking `process.env as Record` casts has
 *     no offenders outside the single allow-listed call site.
 *
 * Together those four checks lock down the behaviour we care about
 * without trying to inject a non-string into the Node env Proxy.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getAppCacheKV,
  getRateLimitKV,
  getRateLimiterDO,
  getClickQueue,
  getAuditArchiveR2,
  getRuntimeEnv,
} from "@/lib/runtime-env";

const KEYS = [
  "APP_CACHE_KV",
  "RATE_LIMIT_KV",
  "RATE_LIMITER_DO",
  "CLICK_QUEUE",
  "AUDIT_ARCHIVE_R2",
] as const;

const ORIG_ENV: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    ORIG_ENV[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (ORIG_ENV[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = ORIG_ENV[k];
    }
  }
});

describe("typed runtime-env accessors — absence and typo paths", () => {
  it("getAppCacheKV returns null when binding is absent", () => {
    expect(getAppCacheKV()).toBeNull();
  });
  it("getAppCacheKV returns null when env var is a stringified typo", () => {
    process.env.APP_CACHE_KV = "some-typo-string";
    expect(getAppCacheKV()).toBeNull();
  });

  it("getRateLimitKV returns null when binding is absent", () => {
    expect(getRateLimitKV()).toBeNull();
  });
  it("getRateLimitKV returns null when env var is a stringified typo", () => {
    process.env.RATE_LIMIT_KV = "some-typo-string";
    expect(getRateLimitKV()).toBeNull();
  });

  it("getRateLimiterDO returns null when binding is absent", () => {
    expect(getRateLimiterDO()).toBeNull();
  });
  it("getRateLimiterDO returns null when env var is a stringified typo", () => {
    process.env.RATE_LIMITER_DO = "some-typo-string";
    expect(getRateLimiterDO()).toBeNull();
  });

  it("getClickQueue returns null when binding is absent", () => {
    expect(getClickQueue()).toBeNull();
  });
  it("getClickQueue returns null when env var is a stringified typo", () => {
    process.env.CLICK_QUEUE = "some-typo-string";
    expect(getClickQueue()).toBeNull();
  });

  it("getAuditArchiveR2 returns null when binding is absent", () => {
    expect(getAuditArchiveR2()).toBeNull();
  });
  it("getAuditArchiveR2 returns null when env var is a stringified typo", () => {
    process.env.AUDIT_ARCHIVE_R2 = "some-typo-string";
    expect(getAuditArchiveR2()).toBeNull();
  });

  it("getRuntimeEnv returns the same identity as process.env (no copy)", () => {
    expect(getRuntimeEnv()).toBe(process.env as unknown);
  });
});

describe("lib/runtime-env.ts source locks", () => {
  let src = "";
  beforeEach(async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(path.resolve(__dirname, "..", "lib", "runtime-env.ts"), "utf8");
  });

  it("getAppCacheKV reads the APP_CACHE_KV name and checks get + put", () => {
    expect(src).toMatch(/getAppCacheKV[\s\S]*APP_CACHE_KV[\s\S]*"get" in[\s\S]*"put" in/);
  });
  it("getRateLimitKV reads the RATE_LIMIT_KV name and checks get + put", () => {
    expect(src).toMatch(/getRateLimitKV[\s\S]*RATE_LIMIT_KV[\s\S]*"get" in[\s\S]*"put" in/);
  });
  it("getRateLimiterDO reads RATE_LIMITER_DO and checks idFromName + get", () => {
    expect(src).toMatch(
      /getRateLimiterDO[\s\S]*RATE_LIMITER_DO[\s\S]*"idFromName" in[\s\S]*"get" in/,
    );
  });
  it("getClickQueue reads the CLICK_QUEUE name and checks send", () => {
    expect(src).toMatch(/getClickQueue[\s\S]*CLICK_QUEUE[\s\S]*"send" in/);
  });
  it("getAuditArchiveR2 reads AUDIT_ARCHIVE_R2 and checks put", () => {
    expect(src).toMatch(/getAuditArchiveR2[\s\S]*AUDIT_ARCHIVE_R2[\s\S]*"put" in/);
  });
});

describe("ESLint rule blocks `(process.env as Record<string, unknown>).BINDING`", () => {
  it("source files in lib/, app/, workers/ do not contain the banned cast (except one allow-listed line)", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    const repoRoot = path.resolve(__dirname, "..");

    async function* walk(dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) yield p;
      }
    }

    const offenders: string[] = [];
    // C-4: rate-limit.ts no longer uses the banned (process.env as Record<…>) cast;
    // it delegates to getRuntimeEnv() instead. No allowlist entries needed.
    const allowList = new Set<string>();

    for (const root of ["lib", "app", "workers"]) {
      const fullRoot = path.join(repoRoot, root);
      try {
        for await (const file of walk(fullRoot)) {
          if (allowList.has(file)) continue;
          if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
          const src = await fs.readFile(file, "utf8");
          if (/\(process\.env as Record<string, unknown>\)/.test(src)) {
            offenders.push(path.relative(repoRoot, file));
          }
        }
      } catch {
        // Directory may not exist; ignore.
      }
    }

    expect(offenders).toEqual([]);
  });

  it("rate-limit.ts delegates to getRuntimeEnv() instead of direct process.env cast", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    const src = await fs.readFile(path.resolve(__dirname, "..", "lib", "rate-limit.ts"), "utf8");
    expect(src).toMatch(/getRuntimeEnv/);
    expect(src).not.toMatch(/\(process\.env as Record<string, unknown>\)/);
  });
});
