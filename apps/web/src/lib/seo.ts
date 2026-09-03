/**
 * Canonical origin for the site.
 *
 * This MUST be the `www` host. The apex (`plebs.finance`) 308-redirects to
 * `www.plebs.finance`, so emitting apex URLs in canonicals, sitemaps or share
 * links points crawlers and social scrapers at a redirect instead of the real
 * page. `NEXT_PUBLIC_APP_URL` should therefore be set to the www form in Vercel.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.plebs.finance"
).replace(/\/$/, "");

export const SITE_NAME = "Plebs";

/** Absolute URL for a site-relative path, e.g. `abs("/faq")`. */
export function abs(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
