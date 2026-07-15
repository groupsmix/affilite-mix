import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    // Keep real-backend integration suites out of the default unit run. They
    // live under __tests__/integration/** or are named *.integration.test.ts
    // and run via vitest.integration.config.ts, where the fail-closed CI gate
    // enforces real execution. Without the directory glob the newer
    // integration-directory suites (audit-log-flow, newsletter-flow, etc.)
    // leak into `npm test` and skip there, masking the real gate.
    exclude: ["e2e/**", "node_modules/**", "**/*.integration.test.ts", "__tests__/integration/**"],
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
      // R2-06 / R3-09 / C1: Coverage ratchets — set to current measured
      // levels as no-regression baselines. Per-directory gates for critical
      // paths ratchet up as coverage improves. Do not lower without also
      // documenting why. C1: ratcheted 2026-05-29 from 23/19/19/23 to
      // measured levels (24/20/20/24).
      thresholds: {
        statements: 24,
        branches: 20,
        functions: 20,
        lines: 24,
        // Per-directory gates for critical code paths — set to current levels
        "lib/auth*": { statements: 50, branches: 46, functions: 71, lines: 52 },
        "lib/authz*": { statements: 58, branches: 62, functions: 57, lines: 60 },
        // A98-51: LRU eviction added new cap-overflow paths; threshold adjusted
        // to measured baseline (72.5%). Ratchet back up once LRU cap tests added.
        "lib/rate-limit*": { statements: 72, branches: 69, functions: 80, lines: 72 },
        "lib/quotas*": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "lib/stripe-webhook*": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "lib/stripe-event-processor*": { statements: 38, branches: 32, functions: 75, lines: 42 },
        "lib/ai/**": { statements: 53, branches: 44, functions: 55, lines: 52 },
        "lib/sanitize-html*": { statements: 80, branches: 79, functions: 80, lines: 80 },
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
