// P03 Gin detail (spec §4): photos with thumbnails, name, distillery,
// country, alcohol content, botanicals, collection status, reviews, cocktails, related gins.
// Private gins are a 404; prices and bottle counts are never shown.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GinGrid from "@/components/GinGrid";
import MediaImage from "@/components/MediaImage";
import { formatDate, formatStrength, humanize, param } from "@/lib/format";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicGin } from "@/lib/types";

import styles from "./gin.module.css";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function load(slug: string) {
  return publicGet<PublicGin>(`/gins/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const gin = await load((await params).slug);
  if (!gin) return { title: "Gin not found" };
  const description =
    gin.description?.slice(0, 160) ??
    `${gin.display_name}: a ${humanize(gin.style).toLowerCase()} gin${gin.country ? ` from ${gin.country}` : ""}, ${formatStrength(gin.abv)}.`;
  return {
    title: gin.display_name,
    description,
    alternates: { canonical: `/gins/${gin.slug}` },
    openGraph: {
      title: gin.display_name,
      description,
      url: `${SITE_URL}/gins/${gin.slug}`,
      images: gin.image ? [{ url: `${SITE_URL}${gin.image.url}`, alt: gin.image.alt ?? "" }] : undefined,
    },
  };
}

export default async function GinPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const gin = await load((await params).slug);
  if (!gin) notFound();
  const photoIndex = Math.min(Math.max(Number(param((await searchParams).photo)) || 0, 0), Math.max(gin.images.length - 1, 0));
  const photo = gin.images[photoIndex];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: gin.display_name,
    brand: { "@type": "Brand", name: gin.brand },
    category: "Gin",
    ...(gin.image && { image: `${SITE_URL}${gin.image.url}` }),
    ...(gin.description && { description: gin.description }),
    ...(gin.rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: gin.rating,
        bestRating: "10",
        worstRating: "0",
        reviewCount: gin.review_count,
      },
    }),
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className={styles.top}>
        <div>
          {photo ? (
            <MediaImage media={photo} className={styles.hero} sizes="(min-width: 900px) 440px, 100vw" priority />
          ) : (
            <div className={styles.hero} aria-hidden="true" />
          )}
          {gin.images.length > 1 && (
            <ul className={styles.thumbs} aria-label="More photos">
              {gin.images.map((image, index) => (
                <li key={image.id}>
                  <Link
                    href={`/gins/${gin.slug}?photo=${index}`}
                    scroll={false}
                    aria-current={index === photoIndex ? "true" : undefined}
                    aria-label={`Photo ${index + 1}${image.alt ? `: ${image.alt}` : ""}`}
                    className={styles.thumbLink}
                  >
                    <MediaImage media={{ ...image, alt: "" }} className={styles.thumb} sizes="72px" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {gin.collection_status && (
            <p className={styles.status}>
              {gin.collection_status === "owned" ? "In the cabinet" : "Previously in the cabinet"}
            </p>
          )}
          <h1 className={styles.title}>{gin.display_name}</h1>
          {gin.distillery && (
            <p className={styles.distillery}>
              by <Link href={`/distilleries/${gin.distillery.slug}`}>{gin.distillery.name}</Link>
            </p>
          )}
          <ul className={styles.facts}>
            {gin.country && (
              <li>
                <strong>Country</strong> {gin.country}
              </li>
            )}
            <li>
              <strong>Style</strong> {humanize(gin.style)}
            </li>
            <li>
              <strong>Alcohol</strong> {formatStrength(gin.abv)}
            </li>
            {gin.rating && (
              <li>
                <strong>Our rating</strong> {gin.rating}/10
              </li>
            )}
          </ul>
          {gin.description && <p className={styles.description}>{gin.description}</p>}
          {gin.botanicals.length > 0 && (
            <>
              <h2 className={styles.smallTitle}>Botanicals</h2>
              <ul className={styles.botanicals}>
                {gin.botanicals.map((b) => (
                  <li key={b}>
                    <Link href={`/collection?botanical=${encodeURIComponent(b)}`} className={styles.botanical}>
                      {humanize(b)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {gin.reviews.length > 0 && (
        <section aria-labelledby="reviews-title" className={styles.section}>
          <h2 id="reviews-title" className={styles.sectionTitle}>
            Reviews
          </h2>
          <ul className={styles.reviews}>
            {gin.reviews.map((review) => (
              <li key={review.slug} className="card">
                <h3 className={styles.reviewTitle}>
                  <Link href={`/reviews/${review.slug}`}>{review.title}</Link>
                </h3>
                <p className="field-hint">
                  {review.rating && <strong>{review.rating}/10 · </strong>}
                  {review.author_name} · {formatDate(review.published_at)}
                </p>
                <p>{review.teaser}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gin.cocktails.length > 0 && (
        <section aria-labelledby="cocktails-title" className={styles.section}>
          <h2 id="cocktails-title" className={styles.sectionTitle}>
            Cocktails to make with it
          </h2>
          <ul className={styles.cocktails}>
            {gin.cocktails.map((c) => (
              <li key={c.slug}>
                <Link href={`/cocktails/${c.slug}`} className={styles.cocktail}>
                  {c.cover ? <MediaImage media={c.cover} className={styles.cocktailImage} sizes="120px" /> : null}
                  <span>
                    <strong>{c.title}</strong>
                    <br />
                    <span className="field-hint">
                      {humanize(c.method)}
                      {c.prep_minutes != null && ` · ${c.prep_minutes} min`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gin.related.length > 0 && (
        <section aria-labelledby="related-title" className={styles.section}>
          <h2 id="related-title" className={styles.sectionTitle}>
            You might also like
          </h2>
          <GinGrid gins={gin.related} />
        </section>
      )}

      <p className={styles.section}>
        <Link href="/collection">← The whole collection</Link>
      </p>
    </div>
  );
}
