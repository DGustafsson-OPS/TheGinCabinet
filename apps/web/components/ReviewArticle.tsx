// A review laid out as on the public site (spec P05: cover, heading, byline/date,
// rating, nose/palate/finish, tonic/garnish, verdict, gin link). The admin
// preview uses this same component, so "preview" really shows the public page.
//
// Text is shown as text: blank lines become paragraphs, and React escapes
// everything, so nothing an editor types can run as code on the site.
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { formatDate } from "@/lib/format";
import type { MediaSummary } from "@/lib/types";

import styles from "./ReviewArticle.module.css";

export type ReviewArticleData = {
  title: string;
  author_name: string;
  published_at: string | null;
  rating: string | null;
  cover: MediaSummary | null;
  gin: { display_name: string; country: string | null; abv: string | null };
  intro: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  tonic: string | null;
  /** The tonic's public page, when the review links to a public tonic. */
  tonic_link: { slug: string; display_name: string } | null;
  garnish: string | null;
  verdict: string | null;
};

/** "Fever-Tree Indian Tonic, garnished with lime", with the tonic linked to its page. */
function PerfectServe({ review }: { review: ReviewArticleData }) {
  const tonicName = review.tonic || review.tonic_link?.display_name;
  const tonic = review.tonic_link ? <Link href={`/tonics/${review.tonic_link.slug}`}>{tonicName}</Link> : tonicName;
  if (!tonic) return <>{review.garnish}</>;
  return review.garnish ? (
    <>
      {tonic}, garnished with {review.garnish}
    </>
  ) : (
    <>{tonic}</>
  );
}

function Paragraphs({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <>
      {text
        .split(/\n\s*\n/) // a blank line starts a new paragraph
        .map((paragraph, index) => (
          <p key={index} className={styles.paragraph}>
            {paragraph.trim()}
          </p>
        ))}
    </>
  );
}

export default function ReviewArticle({ review }: { review: ReviewArticleData }) {
  const notes = [
    { label: "Nose", text: review.nose },
    { label: "Palate", text: review.palate },
    { label: "Finish", text: review.finish },
  ].filter((note) => note.text?.trim());

  return (
    <article className={styles.article}>
      {review.cover && (
        <MediaImage media={review.cover} className={styles.cover} sizes="(min-width: 760px) 720px, 100vw" priority />
      )}
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          Review · {review.gin.display_name}
          {review.gin.country && ` · ${review.gin.country}`}
          {review.gin.abv && ` · ${review.gin.abv} %`}
        </p>
        <h1 className={styles.title}>{review.title}</h1>
        <p className={styles.byline}>
          By {review.author_name}
          {review.published_at && (
            <>
              {" · "}
              <time dateTime={review.published_at}>{formatDate(review.published_at)}</time>
            </>
          )}
        </p>
        {review.rating && (
          <p className={styles.rating}>
            <span className={styles.ratingValue}>{review.rating}</span>
            <span className={styles.ratingScale}> / 10</span>
          </p>
        )}
      </header>

      <Paragraphs text={review.intro} />

      {notes.length > 0 && (
        <section aria-labelledby="notes-title" className={styles.notes}>
          <h2 id="notes-title" className={styles.sectionTitle}>
            Tasting notes
          </h2>
          <dl>
            {notes.map((note) => (
              <div key={note.label} className={styles.note}>
                <dt>{note.label}</dt>
                <dd>
                  <Paragraphs text={note.text} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(review.tonic || review.tonic_link || review.garnish) && (
        <p className={styles.serve}>
          <strong>Perfect serve:</strong> <PerfectServe review={review} />
        </p>
      )}

      {review.verdict && (
        <section aria-labelledby="verdict-title" className={styles.verdict}>
          <h2 id="verdict-title" className={styles.sectionTitle}>
            Verdict
          </h2>
          <Paragraphs text={review.verdict} />
        </section>
      )}
    </article>
  );
}
