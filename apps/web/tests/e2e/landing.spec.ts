import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero headline and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Plebs\.io/i);
    await expect(page.getByText("Bloomberg depth")).toBeVisible();
    await expect(page.getByText("WSB energy", { exact: false })).toBeVisible();
  });

  test("shows start free trial button linking to /signup", async ({ page }) => {
    await page.goto("/");
    const ctaLinks = page.getByRole("link", { name: /start free/i });
    await expect(ctaLinks.first()).toBeVisible();
    await expect(ctaLinks.first()).toHaveAttribute("href", "/signup");
  });

  test("renders pricing section with three plans", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Free")).toBeVisible();
    await expect(page.getByText("$50")).toBeVisible();
    await expect(page.getByText("$99")).toBeVisible();
  });

  test("nav has login link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  test("features section lists key capabilities", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Real-time AI signals")).toBeVisible();
    await expect(page.getByText("Congressional trade tracker")).toBeVisible();
    await expect(page.getByText("Morning briefing")).toBeVisible();
  });
});
