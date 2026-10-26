// Preview a review exactly as the public page will show it (spec §6 "preview
// public format"). Only signed-in admins can open it.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ReviewArticle from "@/components/ReviewArticle";
import ReviewStatusBadge from "@/components/admin/ReviewStatusBadge";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Review } from "@/lib/types";

export const metadata: Metadata = { title: "Preview review" };

type Params = Promise<{ id: string }>;

export default async function ReviewPreviewPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const { data: review } = await apiGet<Review>(`/admin/reviews/${id}`);
  if (!review) notFound();
  const { data: gin } = await apiGet<Gin>(`/admin/gins/${review.gin.id}`);

  return (
    <>
      <div className="preview-banner" role="note">
        <span>
          Preview · <ReviewStatusBadge review={review} />
        </span>
        <Link href={`/admin/reviews/${review.id}`}>← Back to the editor</Link>
      </div>
      <div style={{ background: "var(--color-cream)", marginTop: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
        <ReviewArticle
          review={{
            ...review,
            author_name: review.author.display_name,
            cover: review.cover_image,
            gin: {
              display_name: review.gin.display_name,
              country: gin?.country ?? null,
              abv: gin?.abv ?? null,
            },
          }}
        />
      </div>
    </>
  );
}
