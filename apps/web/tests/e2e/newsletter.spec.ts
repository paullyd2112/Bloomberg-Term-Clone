import { test, expect } from "@playwright/test";

test.describe("Newsletter signup", () => {
  test("renders email input and subscribe button on landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("your@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /get the newsletter/i })).toBeVisible();
  });

  test("validates email before submitting", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: /get the newsletter/i });
    const input = page.getByPlaceholder("your@email.com");

    // HTML5 required + type=email prevents submission of empty/invalid
    await input.fill("");
    await btn.click();
    // Page should not navigate or show success
    await expect(page.getByText(/you're in/i)).not.toBeVisible();
  });

  test("POST /api/newsletter/subscribe rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/newsletter/subscribe", {
      data: { email: "not-an-email" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
