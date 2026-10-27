// The Gin guide as visitors see it: a page (title, summary, cover photo,
// text blocks, previous/next links) and the cards on the guide's front page.
// It borrows the Journal's article and card styles so both read the same.
// The admin preview uses this same component.
import Link from "next/link";

import { ArticleBlock } from "@/components/JournalArticle";
import MediaImage from "@/components/MediaImage";
import type { PublicGuideCard, PublicGuidePage } from "@/lib/types";

import own from "./GuideArticle.module.css";
import styles from "./JournalArticle.module.css";
import cardStyles from "./PostCard.module.css";

export default function GuideArticle({ page }: { page: PublicGuidePage }) {
  return (
    <article className={styles.article}>
      <header className={styles.masthead}>
        <p className={styles.kicker}>
          <Link href="/guide">Gin guide</Link>
        </p>
        <h1 className={styles.title}>{page.title}</h1>
        {page.summary && <p className={styles.standfirst}>{page.summary}</p>}
      </header>

      {page.image && (
        <figure className={styles.hero}>
          <MediaImage media={page.image} className={styles.heroImage} sizes="(min-width: 1200px) 1100px, 100vw" priority />
          {page.hero_credit && <figcaption>Photo: {page.hero_credit}</figcaption>}
        </figure>
      )}

      <div className={styles.body}>
        {page.body.map((block, index) => (
          <ArticleBlock key={index} block={block} />
        ))}
      </div>

      <footer className={own.footer}>
        {(page.previous || page.next) && (
          <nav aria-label="More from the Gin guide">
            <ul>
              {page.previous && (
                <li>
                  Previous: <Link href={`/guide/${page.previous.slug}`}>{page.previous.title}</Link>
                </li>
              )}
              {page.next && (
                <li>
                  Next: <Link href={`/guide/${page.next.slug}`}>{page.next.title}</Link>
                </li>
              )}
            </ul>
          </nav>
        )}
        <p>
          <Link href="/guide">← All of the Gin guide</Link>
        </p>
      </footer>
    </article>
  );
}

function GuideCard({ page }: { page: PublicGuideCard }) {
  return (
    <article className={cardStyles.card}>
      {page.image ? (
        <MediaImage media={page.image} className={cardStyles.image} sizes="(min-width: 1200px) 380px, (min-width: 768px) 50vw, 100vw" />
      ) : (
        <div className={cardStyles.image} aria-hidden="true" />
      )}
      <div className={cardStyles.body}>
        <h2 className={cardStyles.title}>
          {/* The link covers the whole card (see PostCard.module.css). */}
          <Link href={`/guide/${page.slug}`} className={cardStyles.link}>
            {page.title}
          </Link>
        </h2>
        {page.summary && <p className={cardStyles.excerpt}>{page.summary}</p>}
      </div>
    </article>
  );
}

export function GuideGrid({ pages }: { pages: PublicGuideCard[] }) {
  return (
    <ul className={cardStyles.grid}>
      {pages.map((page) => (
        <li key={page.slug}>
          <GuideCard page={page} />
        </li>
      ))}
    </ul>
  );
}
