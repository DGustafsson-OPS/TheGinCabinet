// The list of Journal articles shared by /blog, /blog/category/[slug] and
// /blog/tag/[slug] (spec B01, B03): category chips, keyword search, the
// featured story, the latest-stories grid, pagination and an empty state.
import Link from "next/link";

import { PostGrid, PostHero } from "@/components/PostCard";
import PublicPagination from "@/components/PublicPagination";
import { publicGet } from "@/lib/public-api";
import type { Page, PublicCategory, PublicPostCard } from "@/lib/types";

import styles from "./blog.module.css";

type Props = {
  heading: string;
  intro: string | null;
  basePath: string; // where the search form and pagination point
  page: string;
  search?: string;
  category?: string; // category slug filter
  tag?: string; // tag slug filter
  showFeatured?: boolean;
};

export default async function JournalListing({ heading, intro, basePath, page, search, category, tag, showFeatured }: Props) {
  const query = new URLSearchParams({ page, page_size: "12" });
  if (search) query.set("search", search);
  if (category) query.set("category", category);
  if (tag) query.set("tag", tag);

  // The hero only on the first, unfiltered page of the Journal.
  const wantHero = showFeatured && page === "1" && !search;
  const [data, categories, featuredPage] = await Promise.all([
    publicGet<Page<PublicPostCard>>(`/blog?${query}`),
    publicGet<PublicCategory[]>("/blog/categories"),
    wantHero ? publicGet<Page<PublicPostCard>>("/blog?featured=true&page_size=1") : null,
  ]);
  // No featured article? Then the newest one takes the hero spot.
  const hero = wantHero ? (featuredPage?.items[0] ?? data?.items[0]) : undefined;
  const items = (data?.items ?? []).filter((post) => post.slug !== hero?.slug);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>The Gin Journal</p>
        <h1 className={styles.title}>{heading}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
      </header>

      <nav aria-label="Journal categories">
        <ul className={styles.chips}>
          <li>
            <Link href="/blog" className={styles.chip} aria-current={!category && !tag ? "page" : undefined}>
              All stories
            </Link>
          </li>
          {(categories ?? [])
            .filter((c) => c.post_count > 0 || c.slug === category)
            .map((c) => (
              <li key={c.slug}>
                <Link href={`/blog/category/${c.slug}`} className={styles.chip} aria-current={c.slug === category ? "page" : undefined}>
                  {c.name}
                </Link>
              </li>
            ))}
        </ul>
      </nav>

      {/* A plain form: works before JavaScript loads. */}
      <form className={styles.search} role="search" action={basePath}>
        <div className="field">
          <label htmlFor="journal-search">Search the Journal</label>
          <input id="journal-search" name="search" type="search" defaultValue={search} placeholder="Keyword" />
        </div>
        <button className="button button-primary" type="submit">
          Search
        </button>
      </form>

      {hero && <PostHero post={hero} />}

      {!data ? (
        <p className="alert alert-error" role="alert">
          The Journal could not be loaded right now. Please try again shortly.
        </p>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <p>{search ? `No stories match “${search}”.` : "No stories here yet. Check back soon."}</p>
          {search && <Link href={basePath}>Show all stories</Link>}
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <section aria-labelledby="latest-title">
              <h2 id="latest-title" className={styles.sectionTitle}>
                {hero ? "Latest stories" : "Stories"}
              </h2>
              <PostGrid posts={items} />
            </section>
          )}
          <PublicPagination meta={data.meta} basePath={basePath} params={{ search }} />
        </>
      )}
    </div>
  );
}
