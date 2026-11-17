// Quick reviews: rate a gin with 1–5 juniper berries (or a tonic with 1–5
// tonic bottles) and a line or two, when a full review isn't needed.
// ?gin=<id> or ?tonic=<id> starts the form on that gin or tonic.
import type { Metadata } from "next";

import { param } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { AdminName, Gin, Page, QuickReview, Tonic } from "@/lib/types";

import QuickReviews from "./QuickReviews";

export const metadata: Metadata = { title: "Quick reviews" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuickReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireStaff();
  const query = await searchParams;
  const [{ data: reviews }, gins, tonics, authors] = await Promise.all([
    apiGet<QuickReview[]>("/admin/quick-reviews"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    apiGet<Page<Tonic>>("/admin/tonics?page_size=100"),
    apiGet<AdminName[]>("/admin/users"),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>Quick reviews</h1>
      </div>
      <p className="field-hint">
        For gins and tonics that don&apos;t need a full review: one to five juniper berries for a gin, or one to five
        tonic bottles for a tonic, and a line or two. They appear on its page as soon as you save (if it is public)
        and count towards its rating. Each person can give each gin or tonic one quick review.
      </p>
      <QuickReviews
        reviews={reviews ?? []}
        gins={(gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.display_name, public: g.public_visible }))}
        tonics={(tonics.data?.items ?? []).map((t) => ({ id: t.id, label: t.display_name, public: t.public_visible }))}
        authors={authors.data ?? []}
        me={me.user.id}
        startGin={param(query.gin)}
        startTonic={param(query.tonic)}
      />
    </>
  );
}
