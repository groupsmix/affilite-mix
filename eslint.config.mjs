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

const eslintConfig = [
  { ignores: [".open-next/**", ".next/**"] },
  ...compat.extends("next/core-web-vitals"),
  {
    // A68-F1: Promote jsx-a11y rules from "warn" to "error" so CI fails
    // on new accessibility violations. This covers WCAG 2.1 AA and
    // partially addresses WCAG 2.2 machine-checkable criteria.
    files: ["**/*.tsx", "**/*.jsx"],
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/media-has-caption": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      "jsx-a11y/no-noninteractive-tabindex": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
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
];

export default eslintConfig;
