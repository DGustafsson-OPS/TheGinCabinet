// Distilleries: the producers linked from gins (spec §7 `distilleries`).
import type { Metadata } from "next";
import Link from "next/link";

import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Distillery, Page } from "@/lib/types";

import DistilleryForm from "./DistilleryForm";

export const metadata: Metadata = { title: "Distilleries" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DistilleriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const search = param(raw.search);
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (search) query.set("search", search);
  const { data } = await apiGet<Page<Distillery>>(`/admin/distilleries?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Distilleries</h1>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Name or country" />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The distilleries could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">
          No distilleries {search ? "match" : "yet"}.
          {search && (
            <>
              {" "}
              <Link href="/juniper/distilleries">Clear the search</Link>
            </>
          )}
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Distillery</th>
                  <th scope="col">Country</th>
                  <th scope="col">Region</th>
                  <th scope="col" className="num">
                    Gins
                  </th>
                  <th scope="col">Website</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/juniper/distilleries/${d.id}`}>{d.name}</Link>
                    </td>
                    <td>{d.country ?? "–"}</td>
                    <td>{d.region ?? "–"}</td>
                    <td className="num">
                      <Link href={`/juniper/gins?distillery=${d.id}`} aria-label={`${d.gin_count} gins from ${d.name}`}>
                        {d.gin_count}
                      </Link>
                    </td>
                    <td>
                      {d.website ? (
                        // External links are marked and open safely (spec P08).
                        <a href={d.website} target="_blank" rel="noopener noreferrer">
                          Visit ↗<span className="visually-hidden"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/distilleries" params={{ search }} />
        </>
      )}

      <section className="card" style={{ marginTop: "var(--space-6)" }} aria-labelledby="add-title">
        <h2 id="add-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Add a distillery
        </h2>
        <DistilleryForm />
      </section>
    </>
  );
}
