import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { abs } from "@/lib/seo";

// Re-generate at most hourly; the signal list below changes as signals resolve.
export const revalidate = 3600;

/**
 * Public, indexable routes.
 *
 * Deliberately excluded:
 *  - /founding  — unlisted offer page ("not available on the main site"); it is
 *                 noindex so listing it here would contradict that.
 *  - /onboarding, /unsubscribe — post-signup utility pages with no search value.
 *  - /dashboard/*, /admin/*, /api/* — disallowed in robots.ts.
 */
const STATIC_ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/",              changeFrequency: "daily",   priority: 1.0 },
  { path: "/faq",           changeFrequency: "monthly", priority: 0.7 },
  { path: "/glossary",      changeFrequency: "monthly", priority: 0.7 },
  { path: "/prop-trading",  changeFrequency: "monthly", priority: 0.7 },
  { path: "/signup",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/login",         changeFrequency: "yearly",  priority: 0.3 },
  { path: "/terms",         changeFrequency: "yearly",  priority: 0.2 },
  { path: "/privacy",       changeFrequency: "yearly",  priority: 0.2 },
];

/**
 * Cap on signal URLs. Signal pages are templated, so listing every one risks
 * reading as thin content sitewide; this keeps the strongest recent ones.
 */
const SIGNAL_LIMIT = 300;

/**
 * Only signals that have actually resolved are listed. A PENDING signal has no
 * concluded story, goes stale quickly, and is marked noindex by
 * `generateMetadata` in src/app/signal/[id]/page.tsx — so indexing state and
 * sitemap membership stay in agreement.
 */
async function signalEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient();
    // The admin client is created without generated database types, so the row
    // shape is declared here rather than inferred.
    const { data, error } = await supabase
      .from("signals")
      .select("id, created_at")
      .neq("outcome", "PENDING")
      .order("created_at", { ascending: false })
      .limit(SIGNAL_LIMIT)
      .returns<{ id: number; created_at: string | null }[]>();

    if (error || !data) return [];

    return data.map((s) => ({
      url: abs(`/signal/${s.id}`),
      lastModified: s.created_at ? new Date(s.created_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
  } catch {
    // The database being unreachable must not fail the build or empty the
    // sitemap — degrade to the static routes below instead.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  return [
    ...STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
      url: abs(path),
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...(await signalEntries()),
  ];
}
