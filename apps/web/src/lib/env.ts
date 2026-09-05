function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function requirePublicEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required public environment variable: ${key}`);
  return value;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
export const NEXT_PUBLIC_SUPABASE_URL        = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
export const NEXT_PUBLIC_SUPABASE_ANON_KEY   = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY       = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ─── AI ───────────────────────────────────────────────────────────────────────
export const ANTHROPIC_API_KEY               = () => requireEnv("ANTHROPIC_API_KEY");

// ─── Email ────────────────────────────────────────────────────────────────────
export const RESEND_API_KEY                  = () => requireEnv("RESEND_API_KEY");

// ─── Monitoring ───────────────────────────────────────────────────────────────
export const NEXT_PUBLIC_SENTRY_DSN          = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const SENTRY_AUTH_TOKEN               = () => requireEnv("SENTRY_AUTH_TOKEN");

// ─── Admin ────────────────────────────────────────────────────────────────────
export const ADMIN_EMAILS                    = () => requireEnv("ADMIN_EMAILS");

// ─── App ──────────────────────────────────────────────────────────────────────
export const NEXT_PUBLIC_APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
