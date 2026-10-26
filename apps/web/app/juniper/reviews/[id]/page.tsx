import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, requireAdmin } from "@/lib/server-api";
import { mediaOptions } from "@/lib/media-options";
import type { AdminName, Media, Page, Review } from "@/lib/types";

import ReviewEditor from "./ReviewEditor";

export const metadata: Metadata = { title: "Edit review" };

type Params = Promise<{ id: string }>;

export default async function ReviewPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: review }, authors, media] = await Promise.all([
    apiGet<Review>(`/admin/reviews/${id}`),
    apiGet<AdminName[]>("/admin/users"),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
  ]);
  if (!review) notFound();

  // Keep the current cover selectable even if it isn't in the first 100.
  const options = mediaOptions(media.data?.items ?? [], review.cover_image ? [review.cover_image] : []);

  return (
    <>
      <Link className="back-link" href="/juniper/reviews">
        ← All reviews
      </Link>
      <div className="page-header">
        <h1>{review.title}</h1>
        <Link className="button button-secondary" href={`/juniper/gins/${review.gin.id}`}>
          {review.gin.display_name}
        </Link>
      </div>
      {/* `key`: after each save the page reloads and the editor starts fresh. */}
      <ReviewEditor key={review.version} review={review} authors={authors.data ?? []} media={options} />
    </>
  );
}
