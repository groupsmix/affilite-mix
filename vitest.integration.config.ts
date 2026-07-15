import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/*.integration.test.ts"],
    // J-1: do NOT hard-code placeholder credentials. Real Supabase variables
    // come from the environment / CI secrets; if they are missing the
    // shouldRunSupabaseIntegration guard skips the suite. Hard-coding would
    // mask missing secrets and cause tests to start against a fake endpoint.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Stub `server-only` so the privileged gateway module can be
      // imported in integration tests too.
      "server-only": path.resolve(__dirname, "__tests__/helpers/server-only-shim.ts"),
    },
  },
});
