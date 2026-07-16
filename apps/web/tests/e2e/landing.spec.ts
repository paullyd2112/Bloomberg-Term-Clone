import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero headline and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Plebs/i);
    await expect(page.getByText("Crypto never sleeps.")).toBeVisible();
    await expect(page.getByText("Neither does your analyst.")).toBeVisible();
  });

  test("shows start free trial button linking to /signup", async ({ page }) => {
    await page.goto("/");
    const ctaLinks = page.getByRole("link", { name: /start free/i });
    await expect(ctaLinks.first()).toBeVisible();
    await expect(ctaLinks.first()).toHaveAttribute("href", "/signup");
  });

  test("renders pricing section with two plans", async ({ page }) => {
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
    await expect(page.getByText("24/7 AI crypto signals")).toBeVisible();
    await expect(page.getByText("Prediction-market edge")).toBeVisible();
    await expect(page.getByText("Morning briefing", { exact: true })).toBeVisible();
  });

  test("coverage bar reflects crypto-only pivot", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Polymarket", { exact: true })).toBeVisible();
    // Stock-era features must not be marketed on the landing page.
    await expect(page.getByText("Options Flow")).toHaveCount(0);
  });
});
