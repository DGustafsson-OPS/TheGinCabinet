// One tonic: photo, style, flavour notes, description, our published
// reviews with what each tonic pairs well with, the gins it suits, the
// cocktails that use it, and the gin reviews that name it as the perfect serve.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import MediaImage from "@/components/MediaImage";
import { formatDate, formatStrength, humanize } from "@/lib/format";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicTonic } from "@/lib/types";

import styles from "../tonics.module.css";

type Params = Promise<{ slug: string }>;

const load = (slug: string) => publicGet<PublicTonic>(`/tonics/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tonic = await load((await params).slug);
  if (!tonic) return { title: "Tonic not found" };
  const description =
    tonic.description?.slice(0, 160) ?? `${tonic.display_name}: a ${humanize(tonic.style).toLowerCase()} tonic, rated by The Gin Cabinet.`;
  return {
    title: tonic.display_name,
    description,
    alternates: { canonical: `/tonics/${tonic.slug}` },
    openGraph: {
      title: tonic.display_name,
      description,
      url: `${SITE_URL}/tonics/${tonic.slug}`,
      images: tonic.image ? [{ url: `${SITE_URL}${tonic.image.url}`, alt: tonic.image.alt ?? "" }] : undefined,
    },
  };
}

export default async function TonicPage({ params }: { params: Params }) {
  const tonic = await load((await params).slug);
  if (!tonic) notFound();

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {tonic.image ? (
          <MediaImage media={tonic.image} className={styles.photo} sizes="(min-width: 900px) 400px, 100vw" priority />
        ) : (
          <div className={styles.photo} aria-hidden="true" />
        )}
        <div>
          <h1 className={styles.title}>{tonic.display_name}</h1>
          <p className={styles.meta}>{[humanize(tonic.style), tonic.country].filter(Boolean).join(" · ")}</p>
          {tonic.rating && (
            <p className={styles.rating}>
              <strong>{tonic.rating}</strong>/10{" "}
              <span className="field-hint">
                (average of {tonic.review_count} review{tonic.review_count === 1 ? "" : "s"})
              </span>
            </p>
          )}
          {tonic.description && <p>{tonic.description}</p>}
          {tonic.flavour_notes.length > 0 && (
            <>
              <h2 className="visually-hidden">Flavour notes</h2>
              <ul className={styles.notes} aria-label="Flavour notes">
                {tonic.flavour_notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <section aria-labelledby="tonic-reviews" className={styles.section}>
        <h2 id="tonic-reviews" className={styles.sectionTitle}>
          Our reviews
        </h2>
        {tonic.reviews.length === 0 ? (
          <p className="empty-state">Not reviewed yet.</p>
        ) : (
          <ul className={styles.reviews}>
            {tonic.reviews.map((review, index) => (
              <li key={index} className={styles.review}>
                <div className={styles.reviewHead}>
                  <strong>
                    {review.rating ? `${review.rating}/10` : "Not rated"} · {review.author_name}
                  </strong>
                  {review.published_at && (
                    <time dateTime={review.published_at} className="field-hint">
                      {formatDate(review.published_at)}
                    </time>
                  )}
                </div>
                {review.notes && <p className={styles.reviewText}>{review.notes}</p>}
                {review.pairs_with && (
                  <p className={styles.pairs}>
                    <strong>Pairs well with:</strong> {review.pairs_with}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {tonic.gins.length > 0 && (
        <section aria-labelledby="tonic-suits" className={styles.section}>
          <h2 id="tonic-suits" className={styles.sectionTitle}>
            Gins it suits
          </h2>
          <ul className={styles.reviews}>
            {tonic.gins.map((gin) => (
              <li key={gin.slug} className={styles.review}>
                <div className={styles.reviewHead}>
                  <Link href={`/gins/${gin.slug}`}>
                    <strong>{gin.display_name}</strong>
                  </Link>
                  <span className="field-hint">{[gin.country, formatStrength(gin.abv)].filter(Boolean).join(" · ")}</span>
                </div>
                {gin.pairing_note && <p className={styles.reviewText}>{gin.pairing_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tonic.cocktails.length > 0 && (
        <section aria-labelledby="tonic-cocktails" className={styles.section}>
          <h2 id="tonic-cocktails" className={styles.sectionTitle}>
            Cocktails with this tonic
          </h2>
          <ul className={styles.reviews}>
            {tonic.cocktails.map((c) => (
              <li key={c.slug} className={styles.review}>
                <div className={styles.reviewHead}>
                  <Link href={`/cocktails/${c.slug}`}>
                    <strong>{c.title}</strong>
                  </Link>
                  <span className="field-hint">
                    {humanize(c.method)}
                    {c.prep_minutes != null && ` · ${c.prep_minutes} min`}
                  </span>
                </div>
                {c.teaser && <p className={styles.reviewText}>{c.teaser}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tonic.gin_reviews.length > 0 && (
        <section aria-labelledby="tonic-gins" className={styles.section}>
          <h2 id="tonic-gins" className={styles.sectionTitle}>
            Gins we pour it with
          </h2>
          <ul className={styles.reviews}>
            {tonic.gin_reviews.map((review) => (
              <li key={review.slug} className={styles.review}>
                <div className={styles.reviewHead}>
                  <Link href={`/reviews/${review.slug}`}>
                    <strong>{review.gin.display_name}</strong>
                  </Link>
                  {review.rating && <span className="field-hint">{review.rating}/10</span>}
                </div>
                <p className={styles.reviewText}>{review.teaser}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.section}>
        <Link href="/tonics">← All tonics</Link>
      </p>
    </div>
  );
}
