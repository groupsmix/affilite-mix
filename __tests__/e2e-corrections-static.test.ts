/**
 * Static-source verification for the Playwright E2E corrections (Group A).
 *
 * Spec: audit-fix-verification, task 12.1.
 *
 * These tests read the E2E source files as text and assert the already-applied
 * corrections remain in place, so a future refactor of the Playwright specs
 * cannot silently regress a fix. They run under the normal Vitest suite
 * (`vitest run`) even though the specs themselves live under `e2e/**`, which
 * Vitest excludes from test *execution* — here we only read them as fixtures.
 *
 * Covered requirements: 1.1, 1.3, 1.4, 3.1, 3.2, 4.1, 5.1, 7.1, 7.2, 8.1.
 *
 * KNOWN DIVERGENCES FROM THE REQUIREMENT TEXT (reported, not fabricated):
 *   - R1.4  / R7.1: the 5000 ms title-visibility wait and the 30000 ms
 *     navigation timeout are NOT written as explicit literals; they are
 *     Playwright's built-in defaults (expect timeout = 5000 ms, navigation
 *     timeout = 30000 ms). The explicit `{ timeout: 5_000 }` waits that DO
 *     exist guard the reset-password dialog (R4), not the title.
 *   - R7.2: the post-`domcontentloaded` URL check uses a 10000 ms timeout in
 *     `e2e/admin-site-manager-delete.spec.ts` (the `isLoginPage` race), NOT
 *     the 5000 ms stated in R7.2. We lock the URL-check-instead-of-networkidle
 *     correction at its real value rather than assert a literal that is absent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = join(__dirname, "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

const playwrightConfig = read("playwright.config.ts");
const adminLogin = read("e2e/admin-login.spec.ts");
const siteManager = read("e2e/admin-site-manager-delete.spec.ts");

describe("E2E corrections — static source assertions (task 12.1)", () => {
  // ── R3.1 — CSP bypass for the test browser context ──────────────────
  describe("R3.1 playwright.config.ts bypasses CSP for the test context", () => {
    it("sets bypassCSP on the shared `use` browser-context options", () => {
      // The flag must live under the top-level `use:` block so it applies to
      // the browser context every spec inherits.
      expect(playwrightConfig).toMatch(/bypassCSP\s*:/);
      // Tied to the local/dev run (eval-source-map needs it); intentionally
      // off in CI where tests run against a production build.
      expect(playwrightConfig).toMatch(/bypassCSP\s*:\s*!process\.env\.CI/);
    });
  });

  // ── R3.2 — Hydration-complete signal wait ───────────────────────────
  describe("R3.2 admin-login waits on the hydration-complete signal", () => {
    it('waits for body[data-e2e-hydrated="1"] before interacting', () => {
      expect(adminLogin).toContain('body[data-e2e-hydrated="1"]');
      expect(adminLogin).toMatch(/waitForSelector\(\s*['"]body\[data-e2e-hydrated="1"\]['"]/);
    });
  });

  // ── R1 — Title assertion uses containment, with a visibility wait ───
  describe("R1 admin-login title assertion tolerates the dev-mode suffix", () => {
    it('asserts the title CONTAINS "Admin Login" (containment, not exact match)', () => {
      // R1.3: containment via toContainText, never an exact toHaveText on the h1.
      expect(adminLogin).toMatch(/toContainText\(\s*["']Admin Login["']\s*\)/);
      expect(adminLogin).not.toMatch(/locator\("h1"\)\)\.toHaveText\(\s*["']Admin Login["']/);
    });

    it("uses a 5000 ms visibility wait in the login flow (R1.4)", () => {
      // R1.4 specifies waiting up to 5000 ms for visibility. The title's
      // toContainText relies on Playwright's 5000 ms default expect-timeout;
      // the explicit `{ timeout: 5_000 }` waits guard the reset-password
      // dialog. We lock the explicit 5000 ms wait that is present in source.
      expect(adminLogin).toMatch(/toBeVisible\(\s*\{\s*timeout:\s*5_?000\s*\}\s*\)/);
    });
  });

  // ── R4 — Reset-password dialog scoped by accessible name ────────────
  describe("R4 admin-login selects the dialog by role + accessible name", () => {
    it('targets role "dialog" scoped to the "Reset Password" accessible name', () => {
      // R4.1: scoping by accessible name avoids matching the cookie-consent
      // banner, which also renders role="dialog".
      expect(adminLogin).toMatch(
        /getByRole\(\s*["']dialog["']\s*,\s*\{\s*name:\s*["']Reset Password["']\s*\}\s*\)/,
      );
    });
  });

  // ── R5.1 — Post-login navigation waits on "commit" ──────────────────
  describe("R5.1 post-login navigation waits on commit", () => {
    it('uses waitUntil: "commit" for the post-login URL wait', () => {
      // R5.1: "commit" (not "load"/"networkidle") so the streamed dashboard
      // doesn't time out the wait.
      expect(adminLogin).toMatch(/waitUntil:\s*["']commit["']/);
      expect(adminLogin).not.toMatch(/waitForURL\([^)]*waitUntil:\s*["']networkidle["']/);
    });
  });

  // ── R7 — Stubbed-Supabase navigation: domcontentloaded + URL check ──
  describe("R7 stubbed-Supabase navigation avoids networkidle", () => {
    it('navigates with waitUntil: "domcontentloaded" (R7.1)', () => {
      expect(siteManager).toMatch(/waitUntil:\s*["']domcontentloaded["']/);
    });

    it("never blocks on network idle for the stubbed backend (R7.1/R7.3)", () => {
      // The fix replaced networkidle (which hangs on the stubbed Supabase
      // circuit-breaker retries) with domcontentloaded + an explicit URL
      // check. There must be no actual networkidle wait call.
      expect(siteManager).not.toMatch(/waitForLoadState\(\s*["']networkidle["']\s*\)/);
    });

    it("performs an explicit URL check after navigation instead of awaiting idle (R7.2)", () => {
      // R7.2: compare current URL against the expected destination. NOTE: the
      // source uses a 10000 ms URL-check timeout, not the 5000 ms in R7.2 —
      // this divergence is reported in the task summary rather than asserted
      // as a (false) 5000 ms literal.
      expect(siteManager).toMatch(/waitForURL\(\s*\/\\\/q7m-k4j9\\\/login\//);
      expect(siteManager).toMatch(/page\.url\(\)/);
      expect(siteManager).toMatch(/timeout:\s*10_?000/);
    });
  });

  // ── R8.1 — Disabled menu-item hover is forced ───────────────────────
  describe("R8.1 disabled menu-item hover bypasses tooltip interception", () => {
    it("hovers the disabled delete item with the force option", () => {
      // R8.1: force: true bypasses the Radix TooltipTrigger that overlays the
      // disabled menu item and intercepts the pointer event.
      expect(siteManager).toMatch(/\.hover\(\s*\{\s*force:\s*true\s*\}\s*\)/);
    });
  });
});
