// A05 Tasting journal: private notes, by gin, author and date (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import { formatDate, param } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { AdminName, Page, Tasting } from "@/lib/types";

export const metadata: Metadata = { title: "Tastings" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TastingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const raw = await searchParams;
  const author = param(raw.author);
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (author) query.set("author_id", author);

  const [{ data }, admins] = await Promise.all([
    apiGet<Page<Tasting>>(`/admin/tastings?${query}`),
    apiGet<AdminName[]>("/admin/users"),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>Tastings</h1>
        <Link className="button button-primary" href="/juniper/tastings/new">
          New tasting
        </Link>
      </div>
      <p className="field-hint">Private notes. They are never shown on the public website.</p>

      <div className="toolbar">
        <FilterSelect
          name="author"
          label="Taster"
          allLabel="Both of us"
          options={(admins.data ?? []).map((a) => ({ value: a.id, label: a.display_name }))}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The tastings could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">No tastings yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Gin</th>
                  <th scope="col">Taster</th>
                  <th scope="col" className="num">
                    Rating
                  </th>
                  <th scope="col">Nose</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((tasting) => (
                  <tr key={tasting.id}>
                    <td>
                      <Link href={`/juniper/tastings/${tasting.id}`}>{formatDate(tasting.tasted_on)}</Link>
                    </td>
                    <td>{tasting.gin.display_name}</td>
                    <td>{tasting.author.display_name}</td>
                    <td className="num">{tasting.rating ?? "–"}</td>
                    <td>{tasting.nose ? tasting.nose.slice(0, 80) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/tastings" params={{ author }} />
        </>
      )}
    </>
  );
}
