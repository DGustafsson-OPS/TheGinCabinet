// A03 Bottle inventory: every physical bottle (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import BottleStatusBadge from "@/components/admin/BottleStatusBadge";
import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { formatDate, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Bottle, Page } from "@/lib/types";

export const metadata: Metadata = { title: "Bottles" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = [
  { value: "in_cabinet", label: "In the cabinet (sealed + open)" },
  { value: "sealed", label: "Sealed" },
  { value: "open", label: "Open" },
  { value: "empty", label: "Empty" },
  { value: "gifted", label: "Gifted" },
  { value: "disposed", label: "Disposed" },
];

export default async function BottlesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = { search: param(raw.search), status: param(raw.status) };

  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (filters.search) query.set("search", filters.search);
  if (filters.status === "in_cabinet") query.set("in_cabinet", "true");
  else if (filters.status) query.set("status", filters.status);

  const { data } = await apiGet<Page<Bottle>>(`/admin/bottles?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Bottles</h1>
        <Link className="button button-primary" href="/admin/bottles/new">
          Add bottles
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Gin or shelf" />
        <FilterSelect name="status" label="Status" options={STATUS_OPTIONS} />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The bottles could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No bottles match.</p>
          {(filters.search || filters.status) && <Link href="/admin/bottles">Clear the filters</Link>}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Gin</th>
                  <th scope="col">Bottle</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Size
                  </th>
                  <th scope="col">Shelf</th>
                  <th scope="col">Acquired</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((bottle) => (
                  <tr key={bottle.id}>
                    <td>
                      <Link href={`/admin/bottles/${bottle.id}`}>{bottle.gin.display_name}</Link>
                    </td>
                    <td>#{bottle.id.slice(0, 8)}</td>
                    <td>
                      <BottleStatusBadge bottle={bottle} />
                    </td>
                    <td className="num">{bottle.size_ml} ml</td>
                    <td>{bottle.shelf ?? "–"}</td>
                    <td>{formatDate(bottle.acquired_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/admin/bottles" params={filters} />
        </>
      )}
    </>
  );
}
