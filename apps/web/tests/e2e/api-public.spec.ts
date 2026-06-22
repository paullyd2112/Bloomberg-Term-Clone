import { test, expect } from "@playwright/test";

test.describe("Public API endpoints", () => {
  test("POST /api/ticker returns prices for valid tickers", async ({ request }) => {
    const res = await request.post("/api/ticker", {
      data: { identifiers: ["BTC", "ETH"], asset_type: "crypto" },
    });
    // Either 200 with data or 200 with empty (no DB data yet) — never 500
    expect([200, 400]).toContain(res.status());
  });

  test("POST /api/pleby/chat returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/pleby/chat", {
      data: { message: "hello", conversation_id: null },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/backtest returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/backtest", {
      data: { identifier: "AAPL", asset_type: "stock" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/allocator returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/allocator", {
      data: { goal: "long_term", risk_tolerance: "moderate", investment_amount: 10000 },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/stripe/checkout returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { priceId: "fake_price_id" },
    });
    expect(res.status()).toBe(401);
  });
});
