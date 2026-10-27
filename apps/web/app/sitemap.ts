// /sitemap.xml: every public page, so search engines can find them (spec §3, §10A).
// Only published, public items appear: the public API never lists anything else.
import type { MetadataRoute } from "next";

import { SITE_URL, getSite, publicGet } from "@/lib/public-api";
import { contactFormOn } from "@/lib/turnstile";
import type {
  Page,
  PublicCategory,
  PublicCocktailCard,
  PublicDistilleryCard,
  PublicGinCard,
  PublicPostCard,
  PublicReviewCard,
  PublicTonicCard,
} from "@/lib/types";

// Build it on every request from live data. (By default Next.js would build it
// once, at `npm run build`, when the API may not even be running.)
export const dynamic = "force-dynamic";

/** Fetch every page of a public list (100 at a time). */
async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const data = await publicGet<Page<T>>(`${path}${separator}page=${page}&page_size=100`);
    if (!data) break;
    items.push(...data.items);
    if (page >= data.meta.pages) break;
  }
  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [gins, reviews, cocktails, distilleries, posts, categories, tonics] = await Promise.all([
    all<PublicGinCard>("/gins"),
    all<PublicReviewCard>("/reviews"),
    all<PublicCocktailCard>("/cocktails"),
    publicGet<PublicDistilleryCard[]>("/distilleries"),
    all<PublicPostCard>("/blog"),
    publicGet<PublicCategory[]>("/blog/categories"),
    all<PublicTonicCard>("/tonics"),
  ]);
  const page = (path: string, priority: number, lastModified?: string) => ({
    url: `${SITE_URL}${path}`,
    priority,
    ...(lastModified && { lastModified }),
  });
  return [
    page("/", 1),
    page("/collection", 0.9),
    page("/reviews", 0.9),
    page("/cocktails", 0.9),
    page("/distilleries", 0.6),
    page("/blog", 0.9),
    page("/tonics", 0.7),
    page("/about", 0.4),
    ...(contactFormOn(await getSite()) ? [page("/contact", 0.3)] : []),
    page("/privacy", 0.2),
    ...gins.map((g) => page(`/gins/${g.slug}`, 0.8)),
    ...reviews.map((r) => page(`/reviews/${r.slug}`, 0.8, r.published_at)),
    ...cocktails.map((c) => page(`/cocktails/${c.slug}`, 0.7)),
    ...(distilleries ?? []).map((d) => page(`/distilleries/${d.slug}`, 0.5)),
    ...tonics.map((t) => page(`/tonics/${t.slug}`, 0.6)),
    ...posts.map((p) => page(`/blog/${p.slug}`, 0.8, p.published_at ?? undefined)),
    ...(categories ?? []).filter((c) => c.post_count > 0).map((c) => page(`/blog/category/${c.slug}`, 0.5)),
  ];
}
