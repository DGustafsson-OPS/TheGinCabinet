// Review status. "Live" appears only when visitors can really see the review:
// published AND its gin is public (spec A11: a status badge must never be
// mistaken for a live-public indicator).
import type { Review } from "@/lib/types";

export default function ReviewStatusBadge({ review }: { review: Pick<Review, "status" | "gin_public"> }) {
  if (review.status === "published") {
    return review.gin_public ? (
      <span className="badge badge-public">Live on the site</span>
    ) : (
      <span className="badge badge-open">Published, but the gin is hidden</span>
    );
  }
  const labels = { draft: "Draft", ready: "Ready to publish", archived: "Archived" } as const;
  return <span className="badge badge-private">{labels[review.status]}</span>;
}
