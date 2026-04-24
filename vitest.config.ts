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
    },
  },
});
