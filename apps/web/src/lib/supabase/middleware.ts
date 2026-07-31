import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

function needsAuth(pathname: string): boolean {
  return (
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    AUTH_PAGES.includes(pathname)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  if (!needsAuth(pathname)) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const rawNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const safeNext = /^\/(?!\/)/.test(rawNext) ? rawNext : "/dashboard";
    const url = request.nextUrl.clone();
    url.pathname = safeNext;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
