// Start a review draft, optionally from a private tasting (spec §6 "Publish
// review": create private tasting → start editorial draft for gin → ...).
import type { Metadata } from "next";
import Link from "next/link";

import { param } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { Gin, Page, Tasting } from "@/lib/types";

import NewReviewForm from "./NewReviewForm";

export const metadata: Metadata = { title: "New review" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewReviewPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const raw = await searchParams;
  const tastingId = param(raw.tasting);
  const [gins, tasting] = await Promise.all([
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    tastingId ? apiGet<Tasting>(`/admin/tastings/${tastingId}`) : Promise.resolve({ data: null }),
  ]);
  const ginOptions = (gins.data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <Link className="back-link" href="/juniper/reviews">
        ← All reviews
      </Link>
      <div className="page-header">
        <h1>New review</h1>
      </div>
      {tasting.data && (
        <p className="alert alert-warning">
          Starting from {tasting.data.author.display_name}&apos;s tasting of {tasting.data.gin.display_name}: its
          notes are copied in. The tasting itself stays private.
        </p>
      )}
      <div className="card">
        <NewReviewForm gins={ginOptions} tasting={tasting.data ?? undefined} preselectedGin={param(raw.gin)} />
      </div>
    </>
  );
}
