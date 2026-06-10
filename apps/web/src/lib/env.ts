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

// ─── Stripe ───────────────────────────────────────────────────────────────────
export const STRIPE_SECRET_KEY               = () => requireEnv("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET           = () => requireEnv("STRIPE_WEBHOOK_SECRET");
export const NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = requirePublicEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
export const STRIPE_PRICE_MONTHLY            = () => requireEnv("STRIPE_PRICE_MONTHLY");
export const STRIPE_PRICE_QUARTERLY          = () => requireEnv("STRIPE_PRICE_QUARTERLY");
export const STRIPE_PRICE_ANNUAL             = () => requireEnv("STRIPE_PRICE_ANNUAL");
export const STRIPE_PRICE_ELITE_MONTHLY      = () => requireEnv("STRIPE_PRICE_ELITE_MONTHLY");
export const STRIPE_PRICE_ELITE_ANNUAL       = () => requireEnv("STRIPE_PRICE_ELITE_ANNUAL");
export const STRIPE_PRICE_LIFETIME           = () => requireEnv("STRIPE_PRICE_LIFETIME");
export const STRIPE_PRICE_LIFETIME_ELITE     = () => requireEnv("STRIPE_PRICE_LIFETIME_ELITE");
export const STRIPE_PRICE_ELITE_QUARTERLY    = () => requireEnv("STRIPE_PRICE_ELITE_QUARTERLY");

// ─── Email ────────────────────────────────────────────────────────────────────
export const RESEND_API_KEY                  = () => requireEnv("RESEND_API_KEY");

// ─── Monitoring ───────────────────────────────────────────────────────────────
export const NEXT_PUBLIC_SENTRY_DSN          = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const SENTRY_AUTH_TOKEN               = () => requireEnv("SENTRY_AUTH_TOKEN");

// ─── Admin ────────────────────────────────────────────────────────────────────
export const ADMIN_EMAILS                    = () => requireEnv("ADMIN_EMAILS");

// ─── App ──────────────────────────────────────────────────────────────────────
export const NEXT_PUBLIC_APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
