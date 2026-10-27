// Edit one gin, and see its physical bottles. "[id]" in the folder name makes
// this a *dynamic route*: /juniper/gins/<any id> lands here with params.id set.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BottleStatusBadge from "@/components/admin/BottleStatusBadge";
import { formatDate } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import { mediaOptions } from "@/lib/media-options";
import type { Bottle, Distillery, Gin, Media, Page } from "@/lib/types";

import GinForm from "../GinForm";

export const metadata: Metadata = { title: "Edit gin" };

type Params = Promise<{ id: string }>;

export default async function GinPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;

  // Start all three requests at once, then wait for all of them.
  const [gin, distilleries, bottles, media] = await Promise.all([
    apiGet<Gin>(`/admin/gins/${id}`),
    apiGet<Page<Distillery>>("/admin/distilleries?page_size=100"),
    apiGet<Page<Bottle>>(`/admin/bottles?gin_id=${id}&page_size=100`),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
  ]);
  if (!gin.data) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/gins">
        ← All gins
      </Link>
      <div className="page-header">
        <h1>{gin.data.display_name}</h1>
        <Link className="button button-secondary" href={`/juniper/bottles/new?gin=${id}`}>
          Add bottles
        </Link>
      </div>

      <div className="card">
        {/* `key` makes React start a fresh form if a different gin is opened. */}
        <GinForm
          key={gin.data.id}
          gin={gin.data}
          distilleries={distilleries.data?.items ?? []}
          media={mediaOptions(media.data?.items ?? [], gin.data.images)}
        />
      </div>

      <section aria-labelledby="ratings-title" className="card" style={{ marginTop: "var(--space-6)" }}>
        <h2 id="ratings-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Ratings
        </h2>
        <dl className="rating-facts">
          <dt>Public rating</dt>
          <dd>
            {gin.data.review_rating ? (
              <>
                <strong>{gin.data.review_rating}</strong>/10 from {gin.data.review_count} published review
                {gin.data.review_count === 1 ? "" : "s"}
              </>
            ) : (
              "No published reviews yet"
            )}
          </dd>
          <dt>Our tastings (private)</dt>
          <dd>
            {gin.data.tasting_rating ? (
              <>
                <strong>{gin.data.tasting_rating}</strong>/10 from {gin.data.tasting_count} tasting
                {gin.data.tasting_count === 1 ? "" : "s"}
              </>
            ) : (
              "No rated tastings yet"
            )}
          </dd>
        </dl>
        <p className="field-hint">
          A gin is rated in its reviews (shown on the website) and tastings (private notes), each out of 10.
        </p>
        <div className="form-actions">
          <Link className="button button-secondary" href={`/juniper/tastings/new?gin=${id}`}>
            Record a tasting
          </Link>
          <Link className="button button-secondary" href={`/juniper/reviews/new?gin=${id}`}>
            Write a review
          </Link>
          <Link className="button button-secondary" href={`/juniper/reviews?gin_id=${id}`}>
            Its reviews
          </Link>
        </div>
      </section>

      <section aria-labelledby="bottles-title" style={{ marginTop: "var(--space-6)" }}>
        <h2 id="bottles-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Bottles ({gin.data.bottles_in_cabinet} in the cabinet)
        </h2>
        {!bottles.data || bottles.data.items.length === 0 ? (
          <p className="table-wrap empty-state">No bottles of this gin yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Bottle</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Size
                  </th>
                  <th scope="col">Shelf</th>
                  <th scope="col">Acquired</th>
                </tr>
              </thead>
              <tbody>
                {bottles.data.items.map((bottle) => (
                  <tr key={bottle.id}>
                    <td>
                      <Link href={`/juniper/bottles/${bottle.id}`}>#{bottle.id.slice(0, 8)}</Link>
                    </td>
                    <td>
                      <BottleStatusBadge bottle={bottle} />
                    </td>
                    <td className="num">{bottle.size_ml} ml</td>
                    <td>{bottle.shelf ?? "–"}</td>
                    <td>{formatDate(bottle.acquired_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
