/**
 * Playwright global setup — pre-accepts cookie consent so the banner
 * does not steal focus or overlay page content during E2E tests.
 *
 * Tests that explicitly need the consent banner (e.g. cookie-consent
 * tests) call `context.clearCookies()` before navigating, which
 * removes the cc_cookie and causes the banner to reappear.
 */
import { chromium, type FullConfig } from "@playwright/test";
import path from "node:path";

const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "storage-state.json");

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseURL);
  await page.waitForLoadState("networkidle");

  // Wait for the consent modal to appear (vanilla-cookieconsent)
  const acceptBtn = page.locator('.cm__btn:has-text("Accept All")');
  try {
    await acceptBtn.waitFor({ state: "visible", timeout: 5_000 });
    await acceptBtn.click();
    await page.waitForTimeout(500);
  } catch {
    // Consent banner may not appear (already accepted, or feature disabled)
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
