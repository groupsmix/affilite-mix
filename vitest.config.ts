import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "**/*.integration.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "placeholder",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder",
    },
    // G-37: Coverage thresholds — enforced by `npm run test:coverage` in CI.
    // The thresholds act as a no-regression baseline against the current
    // measured coverage of the `lib/` and `app/` source trees. Ratchet up
    // as coverage improves; do not lower without also documenting why.
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "e2e/**",
        "node_modules/**",
        "scripts/**",
      ],
      // T-01: Raised from 14-18% baseline toward 60% target.
      // Current measured coverage is ~20/17/15/20. Ratchet up as coverage
      // improves; do not lower without documenting why.
      thresholds: {
        statements: 19,
        branches: 16,
        functions: 14,
        lines: 19,
      },
    },
  },
  // Override tsconfig's `jsx: "preserve"` so tests (and any `.tsx` module they
  // import transitively) are transformed by Vite's oxc loader instead of
  // passed through unchanged. Without this, importing a `.tsx` file from a
  // test fails with "content contains invalid JS syntax".
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js replaces `import "server-only"` at compile time, but the
      // npm package always throws at runtime. Map it to an empty module
      // so vitest can import server-only files (e.g. the privileged
      // Supabase gateway) without tripping that runtime guard.
      "server-only": path.resolve(__dirname, "__tests__/helpers/server-only-shim.ts"),
    },
  },
});
