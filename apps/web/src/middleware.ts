import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Simple in-memory rate limiter (best-effort; not shared across Edge instances)
const _rl = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;

const RATE_LIMITS: Record<string, number> = {
  "/api/newsletter/subscribe":     5,
  "/api/stripe/webhook":           20,
  "/api/backtest":                 5,
  "/api/allocator":                5,
  "/api/search":                   30,
  "/api/newsletter/unsubscribe":   5,
};

function isRateLimited(ip: string, pathname: string): boolean {
  const max = RATE_LIMITS[pathname];
  if (!max) return false;

  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const entry = _rl.get(key);

  if (!entry || now > entry.resetAt) {
    _rl.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= max) return true;
  entry.count++;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname in RATE_LIMITS) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip, pathname)) {
      return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
