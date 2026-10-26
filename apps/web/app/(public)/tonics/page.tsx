// Tonics: every public tonic with our ratings. Search, style filter and sort
// are a plain GET form, so each view has its own address and works without
// JavaScript.
import type { Metadata } from "next";
import Link from "next/link";

import PublicPagination from "@/components/PublicPagination";
import { TonicGrid } from "@/components/TonicCard";
import { humanize, param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import { type Page, type PublicTonicCard, TONIC_STYLES } from "@/lib/types";

import styles from "./tonics.module.css";

export const metadata: Metadata = {
  title: "Tonics",
  description: "Tonic waters tasted and rated by The Gin Cabinet, with what they pair well with.",
  alternates: { canonical: "/tonics" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TonicsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const search = param(raw.search)?.trim() || undefined;
  const style = TONIC_STYLES.find((s) => s === param(raw.style));
  const sort = param(raw.sort) === "rating" ? "rating" : "name";
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "24", sort });
  if (search) query.set("search", search);
  if (style) query.set("style", style);
  const data = await publicGet<Page<PublicTonicCard>>(`/tonics?${query}`);
  const filtered = Boolean(search || style);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Tonics</h1>
        <p>Half of every gin and tonic. Here is what we think of the tonics we have tried.</p>
      </header>

      <form className={styles.controls} role="search" action="/tonics">
        <div className="field">
          <label htmlFor="search">Search tonics</label>
          <input id="search" name="search" type="search" defaultValue={search} placeholder="Brand or name" />
        </div>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" name="style" defaultValue={style ?? ""}>
            <option value="">Any style</option>
            {TONIC_STYLES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="name">Name A–Z</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
        <button className="button button-primary" type="submit">
          Show tonics
        </button>
      </form>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The tonics could not be loaded right now. Please try again shortly.
        </p>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <p>{filtered ? "No tonics match." : "No tonics have been added yet."}</p>
          {filtered && <Link href="/tonics">Show all tonics</Link>}
        </div>
      ) : (
        <>
          <TonicGrid tonics={data.items} />
          <PublicPagination meta={data.meta} basePath="/tonics" params={{ search, style, sort: sort === "name" ? undefined : sort }} />
        </>
      )}
    </div>
  );
}
