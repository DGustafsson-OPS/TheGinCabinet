// B02 Article (spec §10A): /blog/[slug], with Open Graph data, a canonical
// URL and structured Article data for search engines.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import JournalArticle from "@/components/JournalArticle";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicPost } from "@/lib/types";

type Params = Promise<{ slug: string }>;

const load = (slug: string) => publicGet<PublicPost>(`/blog/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await load((await params).slug);
  if (!post) return { title: "Article not found" };
  const description = post.seo_description ?? post.excerpt ?? undefined;
  const image = post.social_image;
  return {
    title: post.seo_title ?? post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `${SITE_URL}/blog/${post.slug}`,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      authors: [post.author_name],
      images: image ? [{ url: `${SITE_URL}${image.url}`, alt: image.alt ?? "" }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const post = await load((await params).slug);
  if (!post) notFound();

  // schema.org Article, escaped so the text can't close the <script> tag.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    author: { "@type": "Person", name: post.author_name },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    ...(post.image && { image: `${SITE_URL}${post.image.url}` }),
    ...(post.category && { articleSection: post.category.name }),
    keywords: post.tags.map((t) => t.name).join(", "),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <JournalArticle post={post} />
    </>
  );
}
