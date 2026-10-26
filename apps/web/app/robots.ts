// /robots.txt: tells search engines what they may visit (spec §3).
// The admin area, login page and API are kept out of search results.
import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/public-api";

export const dynamic = "force-dynamic"; // use the SITE_URL of the running server

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
