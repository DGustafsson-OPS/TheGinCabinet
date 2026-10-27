// A gin in a public grid (spec P02: bottle photo, country, style, review
// rating and an Owned / Previously owned badge; never prices or counts).
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { formatStrength, humanize } from "@/lib/format";
import type { PublicGinCard } from "@/lib/types";

import styles from "./GinCard.module.css";

const BADGES = { owned: "In the cabinet", previously_owned: "Previously owned" } as const;

export default function GinCard({ gin }: { gin: PublicGinCard }) {
  return (
    <article className={styles.card}>
      {gin.image ? (
        <MediaImage media={gin.image} className={styles.image} sizes="(min-width: 1200px) 280px, (min-width: 768px) 50vw, 100vw" />
      ) : (
        <div className={styles.image} aria-hidden="true" />
      )}
      {gin.collection_status && (
        <span className={gin.collection_status === "owned" ? styles.badgeOwned : styles.badgePast}>
          {BADGES[gin.collection_status]}
        </span>
      )}
      <div className={styles.body}>
        <h3 className={styles.title}>
          {/* The link covers the whole card (see the CSS). */}
          <Link href={`/gins/${gin.slug}`} className={styles.link}>
            {gin.display_name}
          </Link>
        </h3>
        <p className={styles.meta}>
          {[gin.country, humanize(gin.style), formatStrength(gin.abv)].filter(Boolean).join(" · ")}
        </p>
        {gin.rating && (
          <p className={styles.rating}>
            <strong>{gin.rating}</strong>/10
            <span className={styles.ratingCount}>
              {" "}
              · {gin.review_count} review{gin.review_count === 1 ? "" : "s"}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
