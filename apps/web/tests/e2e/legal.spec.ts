import { test, expect } from "@playwright/test";

test.describe("Legal pages", () => {
  test("terms page loads", async ({ page }) => {
    const res = await page.goto("/terms");
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/terms/i).first()).toBeVisible();
  });

  test("privacy page loads", async ({ page }) => {
    const res = await page.goto("/privacy");
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/privacy/i).first()).toBeVisible();
  });
});
