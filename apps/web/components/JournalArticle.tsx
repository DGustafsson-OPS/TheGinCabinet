// A Gin Journal article as visitors see it (spec B02): masthead, hero image,
// a narrow reading column of blocks, then related gins, reviews, cocktails
// and stories. The admin preview uses this same component.
import Link from "next/link";

import GinGrid from "@/components/GinGrid";
import InlineText from "@/components/InlineText";
import MediaImage from "@/components/MediaImage";
import { PostGrid } from "@/components/PostCard";
import { formatDate } from "@/lib/format";
import type { PublicBlock, PublicPost } from "@/lib/types";

import styles from "./JournalArticle.module.css";

function EmbeddedCard({ block }: { block: Extract<PublicBlock, { type: "card" }> }) {
  // Each kind of card links to its own public page.
  const { href, kicker, title, meta } =
    block.kind === "gin"
      ? {
          href: `/gins/${block.card.slug}`,
          kicker: "Gin",
          title: block.card.display_name,
          meta: [block.card.country, `${block.card.abv} %`].filter(Boolean).join(" · "),
        }
      : block.kind === "review"
        ? {
            href: `/reviews/${block.card.slug}`,
            kicker: "Review",
            title: block.card.title,
            meta: block.card.rating ? `${block.card.rating}/10 · ${block.card.gin.display_name}` : block.card.gin.display_name,
          }
        : block.kind === "cocktail"
          ? {
              href: `/cocktails/${block.card.slug}`,
              kicker: "Cocktail",
              title: block.card.title,
              meta: block.card.teaser,
            }
          : {
              href: `/blog/${block.card.slug}`,
              kicker: "Journal",
              title: block.card.title,
              meta: block.card.excerpt ?? "",
            };
  const image = block.kind === "gin" ? block.card.image : block.kind === "post" ? block.card.image : block.card.cover;
  return (
    <aside className={styles.embed}>
      {image && <MediaImage media={{ ...image, alt: "" }} className={styles.embedImage} sizes="96px" />}
      <div>
        <p className={styles.embedKicker}>{kicker}</p>
        <p className={styles.embedTitle}>
          <Link href={href} className={styles.embedLink}>
            {title}
          </Link>
        </p>
        {meta && <p className={styles.embedMeta}>{meta}</p>}
      </div>
    </aside>
  );
}

function Block({ block }: { block: PublicBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? <h2 className={styles.h2}>{block.text}</h2> : <h3 className={styles.h3}>{block.text}</h3>;
    case "paragraph":
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "quote":
      return (
        <figure className={styles.quote}>
          <blockquote>
            <p>
              <InlineText text={block.text} />
            </p>
          </blockquote>
          {block.cite && <figcaption>— {block.cite}</figcaption>}
        </figure>
      );
    case "image":
      return (
        <figure className={styles.figure}>
          <MediaImage media={block.image} className={styles.inlineImage} sizes="(min-width: 760px) 720px, 100vw" />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case "card":
      return <EmbeddedCard block={block} />;
  }
}

export default function JournalArticle({ post }: { post: PublicPost }) {
  const updated =
    post.published_at && post.updated_at.slice(0, 10) > post.published_at.slice(0, 10) ? post.updated_at : null;
  return (
    <article className={styles.article}>
      <header className={styles.masthead}>
        {post.category && (
          <p className={styles.kicker}>
            <Link href={`/blog/category/${post.category.slug}`}>{post.category.name}</Link>
          </p>
        )}
        <h1 className={styles.title}>{post.title}</h1>
        {post.excerpt && <p className={styles.standfirst}>{post.excerpt}</p>}
        <p className={styles.byline}>
          <span>By {post.author_name}</span>
          {post.published_at && (
            <span>
              Published <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            </span>
          )}
          {updated && (
            <span>
              Updated <time dateTime={updated}>{formatDate(updated)}</time>
            </span>
          )}
          <span>{post.reading_minutes} min read</span>
        </p>
      </header>

      {post.image && (
        <figure className={styles.hero}>
          <MediaImage media={post.image} className={styles.heroImage} sizes="(min-width: 1200px) 1100px, 100vw" priority />
          {post.hero_credit && <figcaption>Photo: {post.hero_credit}</figcaption>}
        </figure>
      )}

      <div className={styles.body}>
        {post.body.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>

      {post.tags.length > 0 && (
        <ul className={styles.tags} aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag.slug}>
              <Link href={`/blog/tag/${tag.slug}`} className={styles.tag}>
                #{tag.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {post.gins.length > 0 && (
        <section aria-labelledby="article-gins" className={styles.more}>
          <h2 id="article-gins" className={styles.moreTitle}>
            Gins in this story
          </h2>
          <GinGrid gins={post.gins} />
        </section>
      )}
      {(post.reviews.length > 0 || post.cocktails.length > 0) && (
        <section aria-labelledby="article-more" className={styles.more}>
          <h2 id="article-more" className={styles.moreTitle}>
            Read and mix next
          </h2>
          <ul className={styles.links}>
            {post.reviews.map((review) => (
              <li key={`r-${review.slug}`}>
                <Link href={`/reviews/${review.slug}`}>{review.title}</Link>
                <span className="field-hint"> · review of {review.gin.display_name}</span>
              </li>
            ))}
            {post.cocktails.map((cocktail) => (
              <li key={`c-${cocktail.slug}`}>
                <Link href={`/cocktails/${cocktail.slug}`}>{cocktail.title}</Link>
                <span className="field-hint"> · cocktail recipe</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {post.related.length > 0 && (
        <section aria-labelledby="article-related" className={styles.more}>
          <h2 id="article-related" className={styles.moreTitle}>
            More from the Journal
          </h2>
          <PostGrid posts={post.related} />
        </section>
      )}
      <p className={styles.more}>
        <Link href="/blog">← Back to the Journal</Link>
      </p>
    </article>
  );
}
