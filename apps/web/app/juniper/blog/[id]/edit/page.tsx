// A12 Journal editor page (spec §10A): /juniper/blog/[id]/edit
// Loads the article and everything its dropdowns need, all at once.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { AdminName, Category, Cocktail, Gin, Media, Page, Post, Review } from "@/lib/types";

import type { RefOptions } from "./BlockEditor";
import PostEditor from "./PostEditor";

export const metadata: Metadata = { title: "Edit article" };

type Params = Promise<{ id: string }>;

export default async function EditPostPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [post, categories, authors, media, gins, reviews, cocktails, posts] = await Promise.all([
    apiGet<Post>(`/admin/blog/${id}`),
    apiGet<Category[]>("/admin/blog/categories"),
    apiGet<AdminName[]>("/admin/users"),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    apiGet<Page<Review>>("/admin/reviews?page_size=100"),
    apiGet<Page<Cocktail>>("/admin/cocktails?page_size=100"),
    apiGet<Page<Post>>("/admin/blog?page_size=100"),
  ]);
  if (!post.data) notFound();

  // Choices for embedded cards and related items.
  const refs: RefOptions = {
    gin: (gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.public_visible ? g.display_name : `${g.display_name} (private)` })),
    review: (reviews.data?.items ?? []).map((r) => ({ id: r.id, label: `${r.title} (${r.status})` })),
    cocktail: (cocktails.data?.items ?? []).map((c) => ({ id: c.id, label: `${c.title} (${c.status})` })),
    post: (posts.data?.items ?? []).filter((p) => p.id !== id).map((p) => ({ id: p.id, label: `${p.title} (${p.status})` })),
  };
  // Keep already-linked items selectable even if they're beyond the first 100.
  for (const relation of post.data.relations) {
    if (!refs[relation.kind].some((o) => o.id === relation.id)) refs[relation.kind].push({ id: relation.id, label: relation.label });
  }
  const chosen = post.data.hero_image ? [post.data.hero_image] : [];

  return (
    <>
      <Link className="back-link" href="/juniper/blog">
        ← All articles
      </Link>
      <div className="page-header">
        <h1>{post.data.title}</h1>
      </div>
      {/* `key`: a different article starts a fresh editor. */}
      <PostEditor
        key={post.data.id}
        post={post.data}
        categories={categories.data ?? []}
        authors={authors.data ?? []}
        media={mediaOptions(media.data?.items ?? [], chosen)}
        refs={refs}
      />
    </>
  );
}
