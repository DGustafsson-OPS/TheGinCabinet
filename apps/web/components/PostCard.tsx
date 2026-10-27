// Journal article cards (spec B01): a 4:3 card for listings and a large
// 16:9 "featured story" hero for the top of the Journal page.
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { formatDate } from "@/lib/format";
import type { PublicPostCard } from "@/lib/types";

import styles from "./PostCard.module.css";

function Byline({ post }: { post: PublicPostCard }) {
  return (
    <p className={styles.meta}>
      {post.author_name}
      {post.published_at && (
        <>
          {" · "}
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        </>
      )}
      {` · ${post.reading_minutes} min read`}
    </p>
  );
}

export default function PostCard({ post, headingLevel = 3 }: { post: PublicPostCard; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={styles.card}>
      {post.image ? (
        <MediaImage media={post.image} className={styles.image} sizes="(min-width: 1200px) 380px, (min-width: 768px) 50vw, 100vw" />
      ) : (
        <div className={styles.image} aria-hidden="true" />
      )}
      <div className={styles.body}>
        {post.category && <p className={styles.kicker}>{post.category.name}</p>}
        <Heading className={styles.title}>
          {/* The link covers the whole card (see the CSS). */}
          <Link href={`/blog/${post.slug}`} className={styles.link}>
            {post.title}
          </Link>
        </Heading>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
        <Byline post={post} />
      </div>
    </article>
  );
}

export function PostHero({ post }: { post: PublicPostCard }) {
  return (
    <article className={styles.hero}>
      {post.image ? (
        <MediaImage media={post.image} className={styles.heroImage} sizes="(min-width: 1200px) 700px, 100vw" priority />
      ) : (
        <div className={styles.heroImage} aria-hidden="true" />
      )}
      <div className={styles.heroBody}>
        <p className={styles.kicker}>Featured{post.category && ` · ${post.category.name}`}</p>
        <h2 className={styles.heroTitle}>
          <Link href={`/blog/${post.slug}`} className={styles.link}>
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className={styles.heroExcerpt}>{post.excerpt}</p>}
        <Byline post={post} />
      </div>
    </article>
  );
}

export function PostGrid({ posts }: { posts: PublicPostCard[] }) {
  return (
    <ul className={styles.grid}>
      {posts.map((post) => (
        <li key={post.slug}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}
