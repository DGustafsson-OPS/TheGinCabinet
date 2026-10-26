// A04 Purchases: every recorded receipt (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { formatDate, formatMoney, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Page, Purchase } from "@/lib/types";

export const metadata: Metadata = { title: "Purchases" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PurchasesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const search = param(raw.search);
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (search) query.set("search", search);
  const { data } = await apiGet<Page<Purchase>>(`/admin/purchases?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Purchases</h1>
        <Link className="button button-primary" href="/admin/purchases/new">
          Record purchase
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Shop or receipt number" />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The purchases could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">No purchases {search ? "match" : "recorded yet"}.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Shop</th>
                  <th scope="col">What</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((purchase) => {
                  const bottles = purchase.lines.reduce((sum, line) => sum + line.quantity, 0);
                  return (
                    <tr key={purchase.id}>
                      <td>
                        <Link href={`/admin/purchases/${purchase.id}`}>
                          {formatDate(purchase.purchased_on)}
                        </Link>
                      </td>
                      <td>
                        {purchase.retailer}
                        {purchase.reference && <div>{purchase.reference}</div>}
                      </td>
                      <td>
                        {bottles} bottle{bottles === 1 ? "" : "s"}:{" "}
                        {purchase.lines.map((line) => line.gin.display_name).join(", ")}
                      </td>
                      <td className="num">
                        {formatMoney(purchase.total, purchase.currency)}
                        {purchase.bottles_without_price > 0 && (
                          <div>+ {purchase.bottles_without_price} without price</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/admin/purchases" params={{ search }} />
        </>
      )}
    </>
  );
}
