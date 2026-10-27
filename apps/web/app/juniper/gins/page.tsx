// A02 Gin catalogue: searchable, filterable table (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { humanize, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import { GIN_STYLES, type Gin, type Page } from "@/lib/types";

export const metadata: Metadata = { title: "Gins" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GinsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = {
    search: param(raw.search),
    style: param(raw.style),
    public: param(raw.public),
    distillery: param(raw.distillery),
  };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (filters.search) query.set("search", filters.search);
  if (filters.style) query.set("style", filters.style);
  if (filters.public) query.set("public", filters.public);
  if (filters.distillery) query.set("distillery_id", filters.distillery);

  const { data } = await apiGet<Page<Gin>>(`/admin/gins?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Gins</h1>
        <Link className="button button-primary" href="/juniper/gins/new">
          Add gin
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Brand, name, edition or country" />
        <FilterSelect
          name="style"
          label="Style"
          options={GIN_STYLES.map((s) => ({ value: s, label: humanize(s) }))}
        />
        <FilterSelect
          name="public"
          label="Visibility"
          options={[
            { value: "true", label: "Public" },
            { value: "false", label: "Private" },
          ]}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The gins could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No gins match.</p>
          {(filters.search || filters.style || filters.public || filters.distillery) && (
            <Link href="/juniper/gins">Clear the filters</Link>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Gin</th>
                  <th scope="col">Style</th>
                  <th scope="col" className="num">
                    ABV
                  </th>
                  <th scope="col">Country</th>
                  <th scope="col" className="num">
                    Bottles
                  </th>
                  <th scope="col" className="num">
                    Rating
                  </th>
                  <th scope="col">Public site</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((gin) => (
                  <tr key={gin.id}>
                    <td>
                      <Link href={`/juniper/gins/${gin.id}`}>{gin.display_name}</Link>
                      {gin.distillery && <div>{gin.distillery.name}</div>}
                    </td>
                    <td>{humanize(gin.style)}</td>
                    <td className="num">{gin.abv} %</td>
                    <td>{gin.country ?? "–"}</td>
                    <td className="num">
                      {gin.bottles_in_cabinet}
                      {gin.bottles_total > gin.bottles_in_cabinet && (
                        <span title="Including finished or given-away bottles">
                          {" "}
                          / {gin.bottles_total}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {gin.review_rating ? (
                        <span title={`Average of ${gin.review_count} published review${gin.review_count === 1 ? "" : "s"}`}>
                          {gin.review_rating}
                        </span>
                      ) : (
                        "–"
                      )}
                      {gin.tasting_rating && (
                        <div className="field-hint" title={`Average of ${gin.tasting_count} tasting${gin.tasting_count === 1 ? "" : "s"}`}>
                          tastings {gin.tasting_rating}
                        </div>
                      )}
                    </td>
                    <td>
                      {gin.public_visible ? (
                        <span className="badge badge-public">Public</span>
                      ) : (
                        <span className="badge badge-private">Private</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/gins" params={filters} />
        </>
      )}
    </>
  );
}
