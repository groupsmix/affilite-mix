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
      // A-10 (audit): the memoised Supabase clients in
      // `lib/server-only/service-role.ts` and `lib/supabase-server.ts`
      // are shared across requests inside the same Worker isolate.
      // Mutating their `.headers` (or anything else on the client) leaks
      // tenant context across requests and produces extremely hard-to-
      // trace auth bugs. We deny the syntactic shapes of those mutations
      // here; per-request headers must be passed at construction time
      // (see `global.headers` in `getAuthenticatedClient`).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.object.type='MemberExpression'][left.object.property.name='headers']",
          message:
            "Do not mutate `.headers` on a Supabase client — the memoised clients in `lib/server-only/service-role.ts` and `lib/supabase-server.ts` are frozen and shared across every request inside a Worker isolate. Build per-request headers via `createClient(..., { global: { headers } })` on a fresh client instead.",
        },
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.object.type='CallExpression'][left.object.callee.name=/^(getPrivilegedSupabaseClient|getServiceClient|getAnonClient|getTenantClient)$/]",
          message:
            "Do not mutate the returned Supabase client — it is shared across every request inside the same Worker isolate (A-10). Construct a fresh client with the headers you need instead.",
        },
      ],
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
];

export default eslintConfig;
