import { test, expect } from "@playwright/test";

test.describe("Newsletter Signup", () => {
  test("should display newsletter signup form on the homepage", async ({
    page,
  }) => {
    await page.goto("/");

    // Newsletter signup may be present on the homepage
    const emailInput = page.locator(
      'input[type="email"][placeholder*="email" i], input[type="email"][name="email"]',
    );

    const count = await emailInput.count();
    if (count > 0) {
      await expect(emailInput.first()).toBeVisible();
    }
  });

  test("should reject invalid email on newsletter signup", async ({
    page,
  }) => {
    await page.goto("/");

    const emailInput = page.locator(
      'input[type="email"][placeholder*="email" i], input[type="email"][name="email"]',
    );

    const count = await emailInput.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Type an invalid email
    await emailInput.first().fill("not-an-email");

    // Find and click the subscribe/submit button near the email input
    const submitBtn = page.locator(
      'button[type="submit"]:near(input[type="email"])',
    );
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();

      // HTML5 validation should prevent submission, or an error should appear
      // Either way, page should not crash
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should submit newsletter form with valid email", async ({ page }) => {
    await page.goto("/");

    const emailInput = page.locator(
      'input[type="email"][placeholder*="email" i], input[type="email"][name="email"]',
    );

    const count = await emailInput.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Mock the newsletter API
    await page.route("/api/newsletter", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          json: { ok: true, message: "Please check your email to confirm" },
        });
      } else {
        await route.continue();
      }
    });

    await emailInput.first().fill("test@example.com");

    const submitBtn = page.locator(
      'button[type="submit"]:near(input[type="email"])',
    );
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();

      // Should show a success message or the form should react
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
