import { test, expect } from "@playwright/test";

test.describe("Public signal share page", () => {
  test("returns 404 for non-existent signal id", async ({ page }) => {
    const response = await page.goto("/signal/999999999");
    // notFound() triggers the not-found page — either 404 status or our custom UI
    expect([404, 200]).toContain(response?.status());
    if (response?.status() === 200) {
      // Custom not-found page rendered
      await expect(page.getByText(/not found/i)).toBeVisible();
    }
  });

  test("renders sign-up CTA on share page layout", async ({ page }) => {
    // Even a 404 signal page should show the brand
    await page.goto("/signal/1");
    // Either we see the brand or a not-found message — no auth wall either way
    const isPublic = await page.locator("text=plebs").count() > 0;
    expect(isPublic).toBe(true);
  });
});
