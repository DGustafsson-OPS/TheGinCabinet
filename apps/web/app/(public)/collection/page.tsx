// P02 Collection (spec §4): search, filters, sort and a responsive grid.
// The filters are a plain GET form, so every filtered view has its own URL
// and works without JavaScript.
import type { Metadata } from "next";
import Link from "next/link";

import GinGrid from "@/components/GinGrid";
import PublicPagination from "@/components/PublicPagination";
import { humanize, param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import type { Facets, Page, PublicGinCard } from "@/lib/types";

import styles from "./collection.module.css";

export const metadata: Metadata = {
  title: "The collection",
  description: "Every gin in The Gin Cabinet: filter by style, country, botanicals, strength and rating.",
  alternates: { canonical: "/collection" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = ["search", "style", "country", "botanical", "abv_min", "abv_max", "min_rating", "sort"] as const;
const SORTS = { name: "Name A–Z", newest: "Newest additions", abv: "Strongest first", rating: "Highest rated" };

export default async function CollectionPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, param(raw[key])?.trim() || undefined]),
  ) as Record<(typeof FILTER_KEYS)[number], string | undefined>;

  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "24" });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const [data, facets] = await Promise.all([
    publicGet<Page<PublicGinCard>>(`/gins?${query}`),
    publicGet<Facets>("/gins/facets"),
  ]);

  // Removable chips for the filters in use.
  const active = FILTER_KEYS.filter((key) => key !== "sort" && filters[key]);
  const without = (key: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== key) next.set(k, v);
    const text = next.toString();
    return text ? `/collection?${text}` : "/collection";
  };
  const chipLabel: Record<string, (v: string) => string> = {
    search: (v) => `“${v}”`,
    style: (v) => humanize(v),
    country: (v) => v,
    botanical: (v) => `With ${v}`,
    abv_min: (v) => `Alcohol from ${v} % vol`,
    abv_max: (v) => `Alcohol up to ${v} % vol`,
    min_rating: (v) => `Rated ${v}+`,
  };

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>The collection</h1>
        <p>
          {data ? `${data.meta.total} gin${data.meta.total === 1 ? "" : "s"}` : "Gins"} catalogued and tasted.
        </p>
      </header>

      <details className={styles.filters} open>
        <summary>Search and filters</summary>
        <form action="/collection" role="search" className={styles.form}>
          <div className="field">
            <label htmlFor="search">Search</label>
            <input id="search" name="search" type="search" defaultValue={filters.search} placeholder="Name, distillery or country" />
          </div>
          <div className="field">
            <label htmlFor="style">Style</label>
            <select id="style" name="style" defaultValue={filters.style ?? ""}>
              <option value="">Any style</option>
              {facets?.styles.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="country">Country</label>
            <select id="country" name="country" defaultValue={filters.country ?? ""}>
              <option value="">Any country</option>
              {facets?.countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="botanical">Botanical</label>
            <select id="botanical" name="botanical" defaultValue={filters.botanical ?? ""}>
              <option value="">Any botanical</option>
              {facets?.botanicals.map((b) => (
                <option key={b} value={b}>
                  {humanize(b)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="abv_min">Alcohol from (% vol)</label>
            <input id="abv_min" name="abv_min" type="number" min={0} max={100} step="0.1" defaultValue={filters.abv_min} />
          </div>
          <div className="field">
            <label htmlFor="abv_max">Alcohol up to (% vol)</label>
            <input id="abv_max" name="abv_max" type="number" min={0} max={100} step="0.1" defaultValue={filters.abv_max} />
          </div>
          <div className="field">
            <label htmlFor="min_rating">Rating</label>
            <select id="min_rating" name="min_rating" defaultValue={filters.min_rating ?? ""}>
              <option value="">Any rating</option>
              {["9", "8", "7", "6"].map((r) => (
                <option key={r} value={r}>
                  {r}+ out of 10
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sort">Sort by</label>
            <select id="sort" name="sort" defaultValue={filters.sort ?? "name"}>
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.actions}>
            <button className="button button-primary" type="submit">
              Show gins
            </button>
            <Link href="/collection">Clear all</Link>
          </div>
        </form>
      </details>

      {active.length > 0 && (
        <ul className={styles.chips} aria-label="Filters in use">
          {active.map((key) => (
            <li key={key}>
              <Link href={without(key)} className={styles.chip}>
                {chipLabel[key](filters[key]!)} <span aria-hidden="true">×</span>
                <span className="visually-hidden"> (remove this filter)</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!data ? (
        <p className="alert alert-error" role="alert">
          The collection could not be loaded right now. Please try again shortly.
        </p>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <p>{active.length ? "No gins match those filters." : "The collection is being catalogued."}</p>
          {active.length > 0 && <Link href="/collection">Clear the filters</Link>}
        </div>
      ) : (
        <>
          <GinGrid gins={data.items} />
          <PublicPagination meta={data.meta} basePath="/collection" params={filters} />
        </>
      )}
    </div>
  );
}
