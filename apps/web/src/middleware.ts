import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkRateLimit, upstashConfigured } from "@/lib/ratelimit";

// In-memory fallback limiter (best-effort; not shared across Edge instances).
// Used only when Upstash Redis is not configured.
const _rl = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_WINDOW_S  = 60;

const RATE_LIMITS: Record<string, number> = {
  "/api/newsletter/subscribe":     5,
  "/api/stripe/webhook":           20,
  "/api/backtest":                 5,
  "/api/allocator":                5,
  "/api/search":                   30,
  "/api/newsletter/unsubscribe":   5,
  "/api/profile":                  10,
  "/api/score-on-demand":          10,
  "/api/push/subscribe":           10,
  "/api/push/unsubscribe":         10,
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
    const max = RATE_LIMITS[pathname];

    const limited = upstashConfigured
      ? !(await checkRateLimit(`${ip}:${pathname}`, max, RATE_LIMIT_WINDOW_S))
      : isRateLimited(ip, pathname);

    if (limited) {
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
