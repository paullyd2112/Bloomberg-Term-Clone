import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private surfaces. /founding is additionally noindex via its own
      // metadata; it is left crawlable so shared links still resolve.
      disallow: ["/api/", "/admin/", "/dashboard/"],
    },
    sitemap: abs("/sitemap.xml"),
    host: abs("/").replace(/\/$/, ""),
  };
}
