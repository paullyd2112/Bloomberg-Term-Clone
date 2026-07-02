import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet, skip session handling so public pages
  // (like the landing page) still render instead of throwing a 500.
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

  // Refresh session — do not remove, required for SSR auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from protected routes
  if (!user && (pathname.startsWith("/dashboard") || pathname === "/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect logged-in users away from auth pages
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const rawNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const safeNext = /^\/(?!\/)/.test(rawNext) ? rawNext : "/dashboard";
    const url = request.nextUrl.clone();
    url.pathname = safeNext;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Standing CC-gate: no free-tier browsing of the product, ever. This is
  // the backstop for the auth/callback redirect above — it catches anyone
  // who bails mid-checkout and comes back later via a bookmark, a password
  // login (which never touches /auth/callback), or a lapsed subscription.
  // /dashboard/upgrade itself must stay reachable — it's the plan picker.
  const requiresActivePlan =
    pathname === "/onboarding" ||
    (pathname.startsWith("/dashboard") && pathname !== "/dashboard/upgrade");

  if (user && requiresActivePlan) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", user.id)
      .single();

    if ((profile?.tier ?? "free") === "free") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/upgrade";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
