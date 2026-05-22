import { test, expect } from "@playwright/test";

test.describe("404 page", () => {
  test("renders for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("404 page has link back to dashboard", async ({ page }) => {
    await page.goto("/does-not-exist-xyz");
    const link = page.getByRole("link", { name: /dashboard/i });
    await expect(link).toHaveAttribute("href", "/dashboard");
  });
});
