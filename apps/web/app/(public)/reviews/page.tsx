// P04 Reviews (spec §4): published reviews with sort and search.
import type { Metadata } from "next";
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { formatDate, param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import type { Page, PublicReviewCard } from "@/lib/types";

import styles from "./reviews.module.css";

export const metadata: Metadata = {
  title: "Reviews",
  description: "Honest gin reviews from The Gin Cabinet: tasting notes, scores and perfect serves.",
  alternates: { canonical: "/reviews" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PublicReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const search = param(raw.search)?.trim();
  const sort = param(raw.sort) === "rating" ? "rating" : "recent";
  const page = param(raw.page) ?? "1";
  const query = new URLSearchParams({ page, page_size: "12", sort });
  if (search) query.set("search", search);
  const data = await publicGet<Page<PublicReviewCard>>(`/reviews?${query}`);

  const hrefFor = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { search, sort: sort === "recent" ? undefined : sort, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const text = next.toString();
    return text ? `/reviews?${text}` : "/reviews";
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Reviews</h1>
        <p>Every gin tasted neat and with tonic, then scored out of ten.</p>
      </header>

      {/* A plain HTML form: works even before JavaScript loads. */}
      <form className={styles.controls} role="search" action="/reviews">
        <div className="field">
          <label htmlFor="search">Search reviews</label>
          <input id="search" name="search" type="search" defaultValue={search} placeholder="Gin or title" />
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="recent">Most recent</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
        <button className="button button-primary" type="submit">
          Show
        </button>
      </form>

      {!data ? (
        <p className="alert alert-error" role="alert">
          Reviews could not be loaded right now. Please try again shortly.
        </p>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <p>{search ? `No reviews match “${search}”.` : "No reviews have been published yet."}</p>
          {search && <Link href="/reviews">Show all reviews</Link>}
        </div>
      ) : (
        <>
          <ul className={styles.grid}>
            {data.items.map((review) => (
              <li key={review.slug} className={styles.card}>
                {review.cover ? (
                  <MediaImage media={review.cover} className={styles.cardImage} sizes="(min-width: 1200px) 380px, (min-width: 768px) 50vw, 100vw" />
                ) : (
                  <div className={styles.cardImage} aria-hidden="true" />
                )}
                <div className={styles.cardBody}>
                  <p className={styles.cardGin}>{review.gin.display_name}</p>
                  <h2 className={styles.cardTitle}>
                    {/* The whole card is clickable via this link (see the CSS). */}
                    <Link href={`/reviews/${review.slug}`} className={styles.cardLink}>
                      {review.title}
                    </Link>
                  </h2>
                  <p className={styles.cardMeta}>
                    {review.rating && <strong>{review.rating}/10 · </strong>}
                    {review.author_name} · <time dateTime={review.published_at}>{formatDate(review.published_at)}</time>
                  </p>
                  <p className={styles.cardTeaser}>{review.teaser}</p>
                </div>
              </li>
            ))}
          </ul>
          {data.meta.pages > 1 && (
            <nav aria-label="Pages" className="pagination">
              {data.meta.page > 1 ? (
                <Link className="button button-secondary" href={hrefFor({ page: String(data.meta.page - 1) })}>
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {data.meta.page} of {data.meta.pages}
              </span>
              {data.meta.page < data.meta.pages ? (
                <Link className="button button-secondary" href={hrefFor({ page: String(data.meta.page + 1) })}>
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
