// A08 Wishlist: private list of gins to buy (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import { formatMoney, param } from "@/lib/format";
import { adminNames, apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page, WishlistItem } from "@/lib/types";

import WishlistAddForm from "./WishlistAddForm";
import WishlistRowActions from "./WishlistRowActions";

export const metadata: Metadata = { title: "Wishlist" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRIORITY = ["", "Must have", "High", "Medium", "Low", "Someday"];

export default async function WishlistPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const status = param(raw.status) ?? "wanted";
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "50", status });

  const [{ data }, gins, names] = await Promise.all([
    apiGet<Page<WishlistItem>>(`/admin/wishlist?${query}`),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    adminNames(),
  ]);
  const ginOptions = (gins.data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <div className="page-header">
        <h1>Wishlist</h1>
      </div>
      <p className="field-hint">Private: the wishlist is never shown on the public website.</p>

      <div className="toolbar">
        <FilterSelect
          name="status"
          label="Show"
          allLabel="Still wanted"
          options={[
            { value: "purchased", label: "Bought" },
            { value: "dropped", label: "Dropped" },
          ]}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The wishlist could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">Nothing here.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Priority</th>
                  <th scope="col">Gin</th>
                  <th scope="col" className="num">
                    Target price
                  </th>
                  <th scope="col">Notes</th>
                  <th scope="col">Added by</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{PRIORITY[item.priority]}</td>
                    <td>
                      <Link href={`/juniper/wishlist/${item.id}`}>{item.text}</Link>
                    </td>
                    <td className="num">{formatMoney(item.target_price, item.currency)}</td>
                    <td>{item.notes ?? "–"}</td>
                    <td>{(item.added_by_id && names.get(item.added_by_id)) ?? "–"}</td>
                    <td>
                      {item.status === "wanted" ? (
                        <WishlistRowActions item={item} />
                      ) : item.purchase_id ? (
                        <Link href={`/juniper/purchases/${item.purchase_id}`}>View purchase</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/wishlist" params={{ status: param(raw.status) }} />
        </>
      )}

      <section className="card" style={{ marginTop: "var(--space-6)" }} aria-labelledby="wish-add-title">
        <h2 id="wish-add-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Add to the wishlist
        </h2>
        <WishlistAddForm gins={ginOptions} />
      </section>
    </>
  );
}
