import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero headline and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Plebs/i);
    await expect(page.getByText("Hedge fund tools.")).toBeVisible();
    await expect(page.getByText("Retail prices.", { exact: false })).toBeVisible();
  });

  test("shows start trial CTAs linking into signup with a plan", async ({ page }) => {
    await page.goto("/");
    const ctaLinks = page.getByRole("link", { name: /start (free|14-day trial|your trial)/i });
    await expect(ctaLinks.first()).toBeVisible();
    await expect(ctaLinks.first()).toHaveAttribute("href", /^\/signup\?plan=(pro|elite)$/);
  });

  test("renders pricing section with Pro and Elite plans", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
    await expect(page.getByText("Elite", { exact: true })).toBeVisible();
    await expect(page.getByText("$40")).toBeVisible();
    await expect(page.getByText("$80")).toBeVisible();
  });

  test("nav has login link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  test("features section lists key capabilities", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Real-time AI signals")).toBeVisible();
    await expect(page.getByText("Congressional trades")).toBeVisible();
    await expect(page.getByText("Morning briefing")).toBeVisible();
  });
});
