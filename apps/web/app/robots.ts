// /robots.txt: tells search engines what they may visit (spec §3).
// The login page and API are kept out of search results. The admin area is
// deliberately NOT listed: robots.txt is public, so naming it here would
// advertise its address. Its pages say "noindex" themselves instead (in their
// layout's metadata and the X-Robots-Tag header in next.config.ts).
import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/public-api";

export const dynamic = "force-dynamic"; // use the SITE_URL of the running server

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/login", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
