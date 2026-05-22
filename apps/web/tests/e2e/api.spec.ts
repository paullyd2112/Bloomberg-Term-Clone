import { test, expect } from "@playwright/test";

test.describe("API auth gates", () => {
  test("POST /api/watchlist returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/watchlist", {
      data: { asset_type: "stock", identifier: "AAPL" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/positions returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/positions", {
      data: { asset_type: "stock", identifier: "AAPL", direction: "LONG", entry_price: 100, size: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/alerts returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/alerts", {
      data: { asset_type: "stock", identifier: "AAPL", trigger_type: "signal_fired" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/onboarding returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/onboarding", {
      data: { trading_experience: "beginner", asset_preferences: ["stocks"] },
    });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/admin/users/[id]/tier returns 403 without admin auth", async ({ request }) => {
    const res = await request.patch("/api/admin/users/00000000-0000-0000-0000-000000000000/tier", {
      data: { tier: "pro" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/admin/codes returns 403 without admin auth", async ({ request }) => {
    const res = await request.post("/api/admin/codes");
    expect([401, 403]).toContain(res.status());
  });
});
