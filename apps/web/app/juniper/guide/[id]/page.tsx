// Edit one Gin guide page: /juniper/guide/[id]
// Loads the page and everything its dropdowns need, all at once.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { RefOptions } from "@/app/juniper/blog/[id]/edit/BlockEditor";
import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { Cocktail, Gin, GuidePage, Media, Page, Post, Review } from "@/lib/types";

import GuidePageEditor from "./GuidePageEditor";

export const metadata: Metadata = { title: "Edit guide page" };

type Params = Promise<{ id: string }>;

export default async function EditGuidePage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;
  const [page, media, gins, reviews, cocktails, posts] = await Promise.all([
    apiGet<GuidePage>(`/admin/guide/${id}`),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    apiGet<Page<Review>>("/admin/reviews?page_size=100"),
    apiGet<Page<Cocktail>>("/admin/cocktails?page_size=100"),
    apiGet<Page<Post>>("/admin/blog?page_size=100"),
  ]);
  if (!page.data) notFound();

  // Choices for gin/review/cocktail/article cards inside the text.
  const refs: RefOptions = {
    gin: (gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.public_visible ? g.display_name : `${g.display_name} (private)` })),
    review: (reviews.data?.items ?? []).map((r) => ({ id: r.id, label: `${r.title} (${r.status})` })),
    cocktail: (cocktails.data?.items ?? []).map((c) => ({ id: c.id, label: `${c.title} (${c.status})` })),
    post: (posts.data?.items ?? []).map((p) => ({ id: p.id, label: `${p.title} (${p.status})` })),
  };
  const chosen = page.data.hero_image ? [page.data.hero_image] : [];

  return (
    <>
      <Link className="back-link" href="/juniper/guide">
        ← All guide pages
      </Link>
      <div className="page-header">
        <h1>{page.data.title}</h1>
      </div>
      {/* `key`: a different page starts a fresh editor. */}
      <GuidePageEditor key={page.data.id} page={page.data} media={mediaOptions(media.data?.items ?? [], chosen)} refs={refs} />
    </>
  );
}
