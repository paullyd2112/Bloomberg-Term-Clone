import { test, expect } from "@playwright/test";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/dashboard/watchlist",
  "/dashboard/portfolio",
  "/dashboard/alerts",
  "/dashboard/briefing",
  "/dashboard/congress",
  "/dashboard/calendar",
  "/dashboard/backtest",
  "/dashboard/pleby",
  "/dashboard/allocator",
  "/dashboard/referrals",
  "/onboarding",
];

test.describe("Auth redirect — unauthenticated", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("/admin redirects non-admin users", async ({ page }) => {
    await page.goto("/admin");
    // Unauthenticated users hit /login first
    await expect(page).toHaveURL(/\/(login|dashboard)/);
  });
});
