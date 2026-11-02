// Quick reviews: rate a gin with 1–5 juniper berries and a line or two, for
// gins that don't need a full review. ?gin=<id> starts the form on that gin.
import type { Metadata } from "next";

import { param } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { AdminName, Gin, Page, QuickReview } from "@/lib/types";

import QuickReviews from "./QuickReviews";

export const metadata: Metadata = { title: "Quick reviews" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuickReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireStaff();
  const gin = param((await searchParams).gin);
  const [{ data: reviews }, gins, authors] = await Promise.all([
    apiGet<QuickReview[]>("/admin/quick-reviews"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    apiGet<AdminName[]>("/admin/users"),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>Quick reviews</h1>
      </div>
      <p className="field-hint">
        For gins that don&apos;t need a full review: one to five juniper berries and a line or two. They appear on the
        gin&apos;s page as soon as you save (if the gin is public) and count towards its rating. Each person can give
        a gin one quick review.
      </p>
      <QuickReviews
        reviews={reviews ?? []}
        gins={(gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.display_name, public: g.public_visible }))}
        authors={authors.data ?? []}
        me={me.user.id}
        startGin={gin}
      />
    </>
  );
}
