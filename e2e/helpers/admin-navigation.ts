import { Page } from "@playwright/test";

export async function gotoAdminAndSettle(
  page: Page,
  path: string,
  readyHeading: string,
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await Promise.race([
    page.waitForURL(/\/q7m-k4j9\/login/, { timeout: 10_000 }).catch(() => {}),
    page
      .getByRole("heading", { name: readyHeading })
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {}),
  ]);
}
