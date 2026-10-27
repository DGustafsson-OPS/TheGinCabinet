// One tasting. Its author can edit it; the other admin sees it read-only
// (spec A05: "Each tasting belongs to one admin").
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDate, humanize } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import { FLAVOURS, type Gin, type Page, type Tasting } from "@/lib/types";

import TastingForm from "../TastingForm";

export const metadata: Metadata = { title: "Tasting" };

type Params = Promise<{ id: string }>;

export default async function TastingPage({ params }: { params: Params }) {
  const session = await requireStaff();
  const { id } = await params;
  const [{ data: tasting }, gins] = await Promise.all([
    apiGet<Tasting>(`/admin/tastings/${id}`),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
  ]);
  if (!tasting) notFound();
  const mine = tasting.author.id === session.user.id;
  const ginOptions = (gins.data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <Link className="back-link" href="/juniper/tastings">
        ← All tastings
      </Link>
      <div className="page-header">
        <h1>
          {tasting.gin.display_name}, {formatDate(tasting.tasted_on)}
        </h1>
        <Link className="button button-secondary" href={`/juniper/reviews/new?tasting=${tasting.id}`}>
          Start a review from this
        </Link>
      </div>

      {mine ? (
        <div className="card">
          <TastingForm key={tasting.version} gins={ginOptions} tasting={tasting} />
        </div>
      ) : (
        <div className="card">
          <p className="alert alert-warning">
            {tasting.author.display_name}&apos;s tasting. Only they can edit it.
          </p>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-2) var(--space-4)" }}>
            {(["context", "nose", "palate", "finish", "tonic", "garnish", "private_notes"] as const).map((field) => (
              <div key={field} style={{ display: "contents" }}>
                <dt>{humanize(field)}</dt>
                <dd style={{ margin: 0, whiteSpace: "pre-line" }}>{tasting[field] ?? "–"}</dd>
              </div>
            ))}
            <dt>Rating</dt>
            <dd style={{ margin: 0 }}>{tasting.rating ?? "–"}</dd>
            <dt>Flavours</dt>
            <dd style={{ margin: 0 }}>
              {FLAVOURS.map((f) => `${humanize(f)} ${tasting.flavours[f] ?? 0}`).join(" · ")}
            </dd>
          </dl>
        </div>
      )}
    </>
  );
}
