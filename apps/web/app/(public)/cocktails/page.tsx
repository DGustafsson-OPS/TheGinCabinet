// P06 Cocktail library (spec §4): cinematic banner, search, filter chips for
// method and difficulty, and a grid of published recipes.
import type { Metadata } from "next";
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import { humanize, param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import { DIFFICULTIES, METHODS, type Page, type PublicCocktailCard } from "@/lib/types";

import styles from "./cocktails.module.css";

export const metadata: Metadata = {
  title: "Cocktails",
  description: "Gin cocktails from The Gin Cabinet, with amounts that scale to your party.",
  alternates: { canonical: "/cocktails" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CocktailLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = {
    search: param(raw.search)?.trim() || undefined,
    method: param(raw.method),
    difficulty: param(raw.difficulty),
  };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "24" });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const data = await publicGet<Page<PublicCocktailCard>>(`/cocktails?${query}`);

  // A link that toggles one filter, keeping the others.
  const chipHref = (key: "method" | "difficulty", value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, [key]: filters[key] === value ? undefined : value })) {
      if (v) next.set(k, v);
    }
    const text = next.toString();
    return text ? `/cocktails?${text}` : "/cocktails";
  };
  const anyFilter = Boolean(filters.search || filters.method || filters.difficulty);

  return (
    <>
      <section className={styles.banner}>
        <div className={styles.bannerInner}>
          <p className={styles.eyebrow}>The cocktail library</p>
          <h1 className={styles.bannerTitle}>Cocktails</h1>
          <p>Classic and modern serves, scaled to however many glasses you&apos;re pouring.</p>
        </div>
      </section>

      <div className={styles.page}>
        <form role="search" action="/cocktails" className={styles.search}>
          {filters.method && <input type="hidden" name="method" value={filters.method} />}
          {filters.difficulty && <input type="hidden" name="difficulty" value={filters.difficulty} />}
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="search">Search recipes</label>
            <input id="search" name="search" type="search" defaultValue={filters.search} placeholder="e.g. tonic, lemon" />
          </div>
          <button className="button button-primary" type="submit">
            Search
          </button>
        </form>

        <div className={styles.chips} aria-label="Filters">
          <span className={styles.chipLabel}>Method:</span>
          {METHODS.map((m) => (
            <Link key={m} href={chipHref("method", m)} className={styles.chip} aria-pressed={filters.method === m}>
              {humanize(m)}
            </Link>
          ))}
          <span className={styles.chipLabel}>Difficulty:</span>
          {DIFFICULTIES.map((d) => (
            <Link key={d} href={chipHref("difficulty", d)} className={styles.chip} aria-pressed={filters.difficulty === d}>
              {humanize(d)}
            </Link>
          ))}
        </div>

        {!data ? (
          <p className="alert alert-error" role="alert">
            The cocktails could not be loaded right now.
          </p>
        ) : data.items.length === 0 ? (
          <div className="empty-state">
            <p>{anyFilter ? "No cocktails match those choices." : "No cocktails have been published yet."}</p>
            {anyFilter && <Link href="/cocktails">Clear the filters</Link>}
          </div>
        ) : (
          <ul className={styles.grid}>
            {data.items.map((c) => (
              <li key={c.slug} className={styles.card}>
                {c.cover ? (
                  <MediaImage media={c.cover} className={styles.cardImage} sizes="(min-width: 1200px) 280px, (min-width: 768px) 50vw, 100vw" />
                ) : (
                  <div className={styles.cardImage} aria-hidden="true" />
                )}
                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>
                    <Link href={`/cocktails/${c.slug}`} className={styles.cardLink}>
                      {c.title}
                    </Link>
                  </h2>
                  <p className={styles.cardMeta}>
                    {humanize(c.method)} · {humanize(c.difficulty)}
                    {c.prep_minutes != null && ` · ${c.prep_minutes} min`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
