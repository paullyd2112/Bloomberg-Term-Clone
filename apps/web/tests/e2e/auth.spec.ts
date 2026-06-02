import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Continue with Google")).toBeVisible();
  });

  test("has link to signup page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /start free trial/i })).toHaveAttribute(
      "href",
      /signup/,
    );
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("notreal@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Supabase returns an error — the form should display it
    await expect(page.locator("[class*=red]").first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Signup page", () => {
  test("renders email and password fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("validates password length", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/8 characters/i)).toBeVisible();
  });

  test("has link back to login", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      /login/,
    );
  });
});
