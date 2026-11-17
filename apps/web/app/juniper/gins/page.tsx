// A02 Gin catalogue: searchable, filterable table (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { humanize, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import { GIN_STYLES, type Gin, type Page } from "@/lib/types";

import GinTable from "./GinTable";

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
        <div className="form-actions" style={{ marginTop: 0 }}>
          <Link className="button button-secondary" href="/juniper/gins/import">
            Import CSV
          </Link>
          <Link className="button button-primary" href="/juniper/gins/new">
            Add gin
          </Link>
        </div>
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
          <GinTable gins={data.items} />
          <Pagination meta={data.meta} basePath="/juniper/gins" params={filters} />
        </>
      )}
    </>
  );
}
