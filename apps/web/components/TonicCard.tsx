// A tonic in a public grid: photo, name, style/country and average rating.
// Uses the gin cards' styles, so both look the same.
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { humanize } from "@/lib/format";
import type { PublicTonicCard } from "@/lib/types";

import styles from "./GinCard.module.css";

export function TonicCard({ tonic }: { tonic: PublicTonicCard }) {
  return (
    <article className={styles.card}>
      {tonic.image ? (
        <MediaImage media={tonic.image} className={styles.image} sizes="(min-width: 1200px) 280px, (min-width: 768px) 50vw, 100vw" />
      ) : (
        <div className={styles.image} aria-hidden="true" />
      )}
      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link href={`/tonics/${tonic.slug}`} className={styles.link}>
            {tonic.display_name}
          </Link>
        </h3>
        <p className={styles.meta}>{[humanize(tonic.style), tonic.country].filter(Boolean).join(" · ")}</p>
        {tonic.rating && (
          <p className={styles.rating}>
            <strong>{tonic.rating}</strong>/10
            <span className={styles.ratingCount}>
              {" "}
              · {tonic.review_count} review{tonic.review_count === 1 ? "" : "s"}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}

export function TonicGrid({ tonics }: { tonics: PublicTonicCard[] }) {
  return (
    <ul className={styles.grid}>
      {tonics.map((tonic) => (
        <li key={tonic.slug}>
          <TonicCard tonic={tonic} />
        </li>
      ))}
    </ul>
  );
}
