// P05 Review detail (spec §4). Only published reviews of public gins exist
// here; anything else is a 404 (spec §11).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ReviewArticle from "@/components/ReviewArticle";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicReview } from "@/lib/types";

type Params = Promise<{ slug: string }>;

async function loadReview(slug: string) {
  return publicGet<PublicReview>(`/reviews/${encodeURIComponent(slug)}`);
}

// Search-engine and social-media details for this page (spec P05 "SEO/social image").
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const review = await loadReview((await params).slug);
  if (!review) return { title: "Review not found" };
  const description = review.seo_description ?? review.teaser;
  const image = review.cover ? `${SITE_URL}${review.cover.url}` : undefined;
  return {
    title: review.seo_title ?? review.title,
    description,
    alternates: { canonical: `/reviews/${review.slug}` },
    openGraph: {
      type: "article",
      title: review.title,
      description,
      url: `${SITE_URL}/reviews/${review.slug}`,
      publishedTime: review.published_at,
      modifiedTime: review.updated_at,
      authors: [review.author_name],
      images: image ? [{ url: image, alt: review.cover?.alt ?? "" }] : undefined,
    },
  };
}

export default async function PublicReviewPage({ params }: { params: Params }) {
  const review = await loadReview((await params).slug);
  if (!review) notFound();

  // Structured data so search engines understand this is a rated review.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    name: review.title,
    datePublished: review.published_at,
    author: { "@type": "Person", name: review.author_name },
    itemReviewed: { "@type": "Product", name: review.gin.display_name, category: "Gin" },
    ...(review.rating && {
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: "10", worstRating: "0" },
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Replacing "<" stops review text from closing this <script> tag early
        // (the escaping the Next.js JSON-LD guide recommends).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ReviewArticle review={review} />
      <p style={{ maxWidth: "var(--reading-max-width)", margin: "0 auto", padding: "0 var(--space-4) var(--space-7)" }}>
        <Link href="/reviews">← All reviews</Link>
      </p>
    </>
  );
}
