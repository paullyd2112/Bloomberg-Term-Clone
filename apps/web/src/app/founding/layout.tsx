import type { Metadata } from "next";

/**
 * `page.tsx` here is a client component and so cannot export metadata itself;
 * this layout supplies it.
 *
 * Deliberately `noindex`: the page states "Founding member pricing — not
 * available on the main site". Surfacing discounted lifetime pricing in search
 * results would defeat the point of an unlisted offer. It stays crawlable and
 * keeps real OG tags so shared and emailed links still render properly — it is
 * simply not listed in the sitemap and not indexed.
 */
export const metadata: Metadata = {
  title: "Founding Membership",
  description:
    "Founding members lock in today's price for life. When prices rise, you never pay more.",
  robots: { index: false, follow: true },
};

export default function FoundingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
