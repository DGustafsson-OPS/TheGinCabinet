// P01 Home (spec §4): hero with two calls to action, latest reviews, featured
// cocktails, collection numbers and a featured gin. The numbers count public
// gins, reviews and recipes only, never private bottles.
import Link from "next/link";

import GinCard from "@/components/GinCard";
import MediaImage from "@/components/MediaImage";
import { formatDate, humanize } from "@/lib/format";
import { getSite, publicGet, siteText } from "@/lib/public-api";
import type { Page, PublicCocktailCard, PublicGinCard, PublicReviewCard, PublicStats } from "@/lib/types";

import styles from "./public.module.css";

export default async function HomePage() {
  const [site, stats, reviews, cocktails, topGins] = await Promise.all([
    getSite(),
    publicGet<PublicStats>("/stats"),
    publicGet<Page<PublicReviewCard>>("/reviews?page_size=3"),
    publicGet<Page<PublicCocktailCard>>("/cocktails?page_size=3"),
    publicGet<Page<PublicGinCard>>("/gins?sort=rating&page_size=1"),
  ]);
  const featured = topGins?.items[0];
  // The wording is edited in Admin → Page texts.
  const text = (key: string) => siteText(site, key);

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{text("home.eyebrow")}</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            The Gin Cabinet
          </h1>
          <p className={styles.heroText}>{text("home.intro")}</p>
          <div className={styles.actions}>
            <Link className="button button-primary" href="/collection">
              Explore gins
            </Link>
            <Link className="button button-secondary" href="/cocktails">
              View cocktails
            </Link>
          </div>
        </div>
      </section>

      {stats && stats.gins > 0 && (
        <section className={styles.stats} aria-label="The collection in numbers">
          {/* Each number links to its page; the whole tile is the link. */}
          <ul>
            {[
              { href: "/collection", count: stats.gins, label: "gins" },
              { href: "/distilleries", count: stats.countries, label: "countries" },
              { href: "/reviews", count: stats.reviews, label: "reviews" },
              { href: "/cocktails", count: stats.cocktails, label: "cocktails" },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.statLink}>
                  <strong>{item.count}</strong> {item.label}
                  <span aria-hidden="true" className={styles.statArrow}>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviews && reviews.items.length > 0 && (
        <section className={styles.band} aria-labelledby="latest-reviews">
          <div className={styles.bandHeader}>
            <h2 id="latest-reviews">Latest reviews</h2>
            <Link href="/reviews">All reviews →</Link>
          </div>
          <ul className={styles.threeUp}>
            {reviews.items.map((review) => (
              <li key={review.slug} className={styles.tile}>
                {review.cover && <MediaImage media={review.cover} className={styles.tileImage} sizes="(min-width: 900px) 380px, 100vw" />}
                <div className={styles.tileBody}>
                  <p className={styles.tileKicker}>{review.gin.display_name}</p>
                  <h3>
                    <Link href={`/reviews/${review.slug}`} className={styles.tileLink}>
                      {review.title}
                    </Link>
                  </h3>
                  <p className={styles.tileMeta}>
                    {review.rating && <strong>{review.rating}/10 · </strong>}
                    {review.author_name} · {formatDate(review.published_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cocktails && cocktails.items.length > 0 && (
        <section className={styles.band} aria-labelledby="featured-cocktails">
          <div className={styles.bandHeader}>
            <h2 id="featured-cocktails">Featured cocktails</h2>
            <Link href="/cocktails">All cocktails →</Link>
          </div>
          <ul className={styles.threeUp}>
            {cocktails.items.map((c) => (
              <li key={c.slug} className={styles.tile}>
                {c.cover && <MediaImage media={c.cover} className={styles.tileImage} sizes="(min-width: 900px) 380px, 100vw" />}
                <div className={styles.tileBody}>
                  <h3>
                    <Link href={`/cocktails/${c.slug}`} className={styles.tileLink}>
                      {c.title}
                    </Link>
                  </h3>
                  <p className={styles.tileMeta}>
                    {humanize(c.method)} · {humanize(c.difficulty)}
                    {c.prep_minutes != null && ` · ${c.prep_minutes} min`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured && (
        <section className={styles.band} aria-labelledby="featured-gin">
          <div className={styles.bandHeader}>
            <h2 id="featured-gin">Featured gin</h2>
          </div>
          <div className={styles.featured}>
            <GinCard gin={featured} />
          </div>
        </section>
      )}

      {!stats?.gins && (
        <section className={styles.section} aria-labelledby="soon-title">
          <h2 id="soon-title">{text("home.empty_title")}</h2>
          <p>{text("home.empty_text")}</p>
        </section>
      )}
    </>
  );
}
