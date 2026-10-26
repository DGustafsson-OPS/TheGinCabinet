// Tonics: a simple list (no stock), each with your reviews.
import type { Metadata } from "next";
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { humanize, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import { type Page, TONIC_STYLES, type Tonic } from "@/lib/types";

export const metadata: Metadata = { title: "Tonics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TonicsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = { search: param(raw.search), style: param(raw.style) };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const { data } = await apiGet<Page<Tonic>>(`/admin/tonics?${query}`);
  const filtered = Boolean(filters.search || filters.style);

  return (
    <>
      <div className="page-header">
        <h1>Tonics</h1>
        <Link className="button button-primary" href="/juniper/tonics/new">
          Add tonic
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Brand, name or country" />
        <FilterSelect name="style" label="Style" options={TONIC_STYLES.map((s) => ({ value: s, label: humanize(s) }))} />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The tonics could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No tonics {filtered ? "match" : "yet"}.</p>
          {filtered && <Link href="/juniper/tonics">Clear the filters</Link>}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Photo</span>
                  </th>
                  <th scope="col">Tonic</th>
                  <th scope="col">Style</th>
                  <th scope="col">Country</th>
                  <th scope="col">Reviews</th>
                  <th scope="col">Public</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((tonic) => {
                  const published = tonic.reviews.filter((r) => r.status === "published").length;
                  return (
                    <tr key={tonic.id}>
                      <td>{tonic.image && <MediaImage media={{ ...tonic.image, alt: "" }} sizes="64px" className="photo-thumb" />}</td>
                      <td>
                        <Link href={`/juniper/tonics/${tonic.id}`}>{tonic.display_name}</Link>
                      </td>
                      <td>{humanize(tonic.style)}</td>
                      <td>{tonic.country ?? "–"}</td>
                      <td>
                        {published} published
                        {tonic.reviews.length > published && ` · ${tonic.reviews.length - published} draft`}
                      </td>
                      <td>
                        <span className={`badge ${tonic.public_visible ? "badge-public" : "badge-private"}`}>
                          {tonic.public_visible ? "Public" : "Private"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/tonics" params={filters} />
        </>
      )}
    </>
  );
}
