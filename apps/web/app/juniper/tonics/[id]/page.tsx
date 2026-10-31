// One tonic: its details and everyone's reviews of it.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { AdminName, Gin, Media, Page, Tonic } from "@/lib/types";

import TonicForm from "../TonicForm";
import TonicReviews from "./TonicReviews";

export const metadata: Metadata = { title: "Edit tonic" };

type Params = Promise<{ id: string }>;

export default async function TonicPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;
  const [{ data: tonic }, media, authors, gins] = await Promise.all([
    apiGet<Tonic>(`/admin/tonics/${id}`),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
    apiGet<AdminName[]>("/admin/users"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
  ]);
  if (!tonic) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/tonics">
        ← All tonics
      </Link>
      <div className="page-header">
        <h1>{tonic.display_name}</h1>
        {tonic.public_visible && (
          <Link className="button button-secondary" href={`/tonics/${tonic.slug}`}>
            View on the site
          </Link>
        )}
      </div>
      {/* `key`: after each save the page reloads and the form starts fresh. */}
      <TonicForm
        key={tonic.version}
        tonic={tonic}
        media={mediaOptions(media.data?.items ?? [], tonic.image ? [tonic.image] : [])}
        gins={(gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.display_name }))}
      />
      <TonicReviews tonic={tonic} authors={authors.data ?? []} />
    </>
  );
}
