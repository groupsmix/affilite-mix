import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * P2-B (PR-E): `no-restricted-syntax` selector that bans the
 * `(process.env as Record<string, unknown>)` cast pattern used to access
 * Cloudflare Worker bindings (KV / Queue / R2 / DO namespaces). The
 * runtime env now exposes typed accessors in `lib/runtime-env.ts`
 * (`getAppCacheKV`, `getRateLimitKV`, `getRateLimiterDO`, `getClickQueue`,
 * `getAuditArchiveR2`). The raw cast erases the binding shape and lets
 * misshaped objects silently slip past TypeScript.
 *
 * ESLint flat-config replaces (does NOT merge) `no-restricted-syntax`
 * settings across overlapping file blocks, so this object is duplicated
 * into each block below — extracting it here keeps the message and
 * selector in lock-step.
 */
const runtimeEnvCastBan = {
  selector:
    "TSAsExpression[expression.object.name='process'][expression.property.name='env'][typeAnnotation.typeName.name='Record']",
  message:
    "Don't cast process.env to Record<string, unknown> to access Cloudflare bindings. Use a typed accessor from lib/runtime-env.ts (getAppCacheKV, getRateLimitKV, getRateLimiterDO, getClickQueue, getAuditArchiveR2). (PR-E P2-B)",
};

/**
 * F-ARCH-03 (#611): Ban `.unsafeNoSiteFilter()` calls outside the DAL layer
 * and privileged routes (cron/queue/webhook/admin). This method bypasses
 * tenant scoping and must be confined to audited call-sites.
 */
const unsafeNoSiteFilterBan = {
  selector: "CallExpression[callee.property.name='unsafeNoSiteFilter']",
  message:
    "unsafeNoSiteFilter() bypasses tenant scoping. Only lib/dal/*, lib/server-only/*, " +
    "lib/click-queue.ts, and privileged API routes (cron/queue/webhook/admin/internal) " +
    "may use it. Add tenant filtering with .eq('site_id', …) instead. (#611)",
};

const eslintConfig = [
  { ignores: [".open-next/**", ".next/**", "coverage/**"] },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // FR-06 (open-items 2026-06-10): runtime code must log through
      // lib/logger so every line in the Cloudflare log stream is one
      // parseable JSON object. The surviving console.* sites are
      // deliberate last-resort sinks (pre-logger module init, browser-only
      // diagnostics, error-boundary meta-failures, the logger transport
      // itself) and carry inline eslint-disable comments explaining why.
      // CLI scripts are exempted wholesale in the scripts/** block below.
      "no-console": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "off",
      // Service-role access bypasses RLS, so the only sanctioned path for
      // a privileged Supabase client is the server-only gateway at
      // `lib/server-only/service-role.ts`. Importing `getServiceClient`
      // from any `**/supabase-server` path is forbidden so the gateway
      // remains the single point where the service-role key is read.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase-server",
              importNames: ["getServiceClient"],
              message:
                'Use the approved server-only privileged gateway: `import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"`.',
            },
          ],
          patterns: [
            {
              group: ["**/supabase-server"],
              importNames: ["getServiceClient"],
              message:
                'Use the approved server-only privileged gateway: `import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"`.',
            },
          ],
        },
      ],
      // A-010: Direct access to the service-role env var outside the gateway
      // is forbidden so the key never leaks into non-privileged code paths.
      "no-restricted-globals": [
        "error",
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          message:
            "Access SUPABASE_SERVICE_ROLE_KEY only through the server-only gateway at `lib/server-only/service-role.ts`.",
        },
      ],
    },
  },
  {
    // F-ARCH-02 / A-05: Enforce DAL site-scoping — raw .from("table") calls
    // on supabase clients outside the DAL layer are forbidden. Promoted from
    // "warn" to "error" per audit finding A-05: DAL helpers exist and the
    // newsletter route was already using raw sb.from() in a public API route.
    // The selector matches: <expr>.from(<stringLiteral>) which catches
    // sb.from("table"), supabase.from("table"), etc.
    files: ["app/**/*.ts", "app/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from'] > Literal:first-child",
          message:
            "Prefer tenantQuery() from @/lib/dal/tenant-query over raw .from(). " +
            "If this is Array.from() or a privileged context (cron/queue/webhook), " +
            "add an eslint-disable comment with audit justification.",
        },
        {
          selector: "CallExpression[callee.property.name='select'] > Literal[value='*']",
          message:
            'select("*") exposes future sensitive columns. Use an explicit column list constant (e.g. LIST_COLUMNS).',
        },
        {
          // Audit-etap1 #6: every `dangerouslySetInnerHTML` must wrap its
          // `__html` value in `sanitizeHtml(...)` or `safeJsonLdString(...)`
          // at the JSX call site. Variable references, template literals,
          // and unsanitised inputs must carry an explicit
          // `// eslint-disable-next-line` comment that names the
          // hand-controlled string (e.g. the theme-init bootstrap script).
          // audit5-#24/#32 added `sanitizeHtmlMemoized` as an LRU-backed
          // wrapper around the bare sanitizer for server components. The
          // memoized variant is treated as semantically equivalent here
          // because it delegates to the same `sanitizeHtml` implementation;
          // any output that satisfies the bare sanitizer also satisfies
          // the memoized one.
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML']:not(:has(CallExpression[callee.name=/^(sanitizeHtml|sanitizeHtmlMemoized|safeJsonLdString)$/]))",
          message:
            "dangerouslySetInnerHTML must wrap its `__html` value in sanitizeHtml(...), sanitizeHtmlMemoized(...) or safeJsonLdString(...) at the JSX call site. Hand-controlled literals (e.g. nonced bootstrap scripts) require an `// eslint-disable-next-line` comment naming the source. (audit-etap1 #6)",
        },
        runtimeEnvCastBan,
      ],
    },
  },
  {
    // F-ARCH-03 (#611): Ban unsafeNoSiteFilter() in regular app routes.
    // Privileged contexts (cron, queue, webhook, admin, internal, auth)
    // are excluded — they operate cross-tenant by design.
    files: ["app/**/*.ts", "app/**/*.tsx"],
    ignores: [
      "app/api/cron/**",
      "app/api/queue/**",
      "app/api/internal/**",
      "app/api/membership/webhook/**",
      "app/api/admin/**",
      "app/api/auth/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        unsafeNoSiteFilterBan,
        {
          selector: "CallExpression[callee.property.name='from'] > Literal:first-child",
          message:
            "Prefer tenantQuery() from @/lib/dal/tenant-query over raw .from(). " +
            "If this is Array.from() or a privileged context (cron/queue/webhook), " +
            "add an eslint-disable comment with audit justification.",
        },
        {
          selector: "CallExpression[callee.property.name='select'] > Literal[value='*']",
          message:
            'select("*") exposes future sensitive columns. Use an explicit column list constant (e.g. LIST_COLUMNS).',
        },
        {
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML']:not(:has(CallExpression[callee.name=/^(sanitizeHtml|sanitizeHtmlMemoized|safeJsonLdString)$/]))",
          message:
            "dangerouslySetInnerHTML must wrap its `__html` value in sanitizeHtml(...), sanitizeHtmlMemoized(...) or safeJsonLdString(...) at the JSX call site. Hand-controlled literals (e.g. nonced bootstrap scripts) require an `// eslint-disable-next-line` comment naming the source. (audit-etap1 #6)",
        },
        runtimeEnvCastBan,
      ],
    },
  },
  {
    // The legacy thin wrapper is allowed to keep a single import of the
    // privileged gateway until it is fully removed.
    files: ["lib/supabase-server.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // FIX-06/17 (F-008): Forbid direct getAdminSession() in admin API routes.
    // Admin routes must use requireAdmin() or withAuthz() which enforce
    // rate limiting, site validation, and membership checks.
    files: ["app/api/admin/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth",
              importNames: ["getAdminSession"],
              message:
                "Use requireAdmin() from @/lib/admin-guard or withAuthz() from @/lib/authz instead of getAdminSession(). Direct usage bypasses rate limiting, site validation, and membership checks. (F-008)",
            },
          ],
        },
      ],
    },
  },
  {
    // P1-6: Forbid service-role imports in regular API routes.
    // Only cron, queue, webhook, and admin-approved server modules may use
    // the privileged Supabase client. Other routes should use getTenantClient()
    // or getAnonClient() to ensure RLS enforcement.
    files: ["app/api/**/*.ts"],
    ignores: [
      "app/api/cron/**",
      "app/api/internal/**",
      "app/api/membership/webhook/**",
      "app/api/admin/**",
      "app/api/auth/**",
      "app/api/queue/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/server-only/service-role",
              message:
                "Service-role client bypasses RLS. Use getTenantClient() or getAnonClient() instead. Only cron/queue/webhook/admin modules may use the privileged client. (P1-6)",
            },
            {
              name: "@/lib/supabase-server",
              importNames: ["getServiceClient"],
              message:
                "Service-role client bypasses RLS. Use getTenantClient() or getAnonClient() instead. (P1-6)",
            },
          ],
        },
      ],
    },
  },
  {
    // Risk #1: Ban select("*") in DAL files to prevent future
    // sensitive column exposure. Use explicit column projections instead.
    //
    // Also (P2-B, PR-E): bans `(process.env as Record<string, unknown>)`
    // casts so DAL code can't slip a binding lookup past the typed
    // accessors in `lib/runtime-env.ts`. ESLint flat-config replaces
    // (does NOT merge) `no-restricted-syntax` selectors across overlapping
    // file blocks, so this rule must list every selector that should fire
    // on these files.
    files: ["lib/dal/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='select'] > Literal[value='*']",
          message:
            'select("*") exposes future sensitive columns. Use an explicit column list constant (e.g. LIST_COLUMNS).',
        },
        runtimeEnvCastBan,
      ],
    },
  },
  {
    // P2-B (PR-E): Ban `(process.env as Record<string, unknown>)` casts on
    // every other lib/, workers/ source file. The `app/**` files block at
    // the top of this config already includes the same selector — we have
    // to repeat it because flat-config replaces overlapping `no-restricted-
    // syntax` settings.
    //
    // The single legitimate remaining caller (`lib/rate-limit.ts`'s
    // `readBinding(name)` generic helper) is allow-listed via an inline
    // `eslint-disable-next-line` because it's a runtime name-indexed
    // accessor used by the generic rate-limit shim, not a typed-binding
    // bypass.
    files: ["lib/**/*.ts", "workers/**/*.ts"],
    ignores: ["lib/dal/**/*.ts", "**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", runtimeEnvCastBan],
    },
  },
  {
    // FR-06: console IS the interface for CLI scripts (human-readable
    // stdout/stderr), and lib/logger's three console calls are the
    // transport that feeds the Cloudflare log stream. Tests and e2e specs
    // may also print diagnostics directly. Exempt all of them from the
    // global no-console policy above.
    files: [
      "scripts/**/*.ts",
      "lib/logger.ts",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "e2e/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
