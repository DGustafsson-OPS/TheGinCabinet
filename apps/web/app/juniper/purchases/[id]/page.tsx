// One purchase: edit its details and line prices; its lines and totals (spec §5 A04).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDate, formatMoney } from "@/lib/format";
import { adminNames, apiGet, requireAdmin } from "@/lib/server-api";
import type { Purchase } from "@/lib/types";

import PurchaseEditForm from "./PurchaseEditForm";

export const metadata: Metadata = { title: "Purchase" };

type Params = Promise<{ id: string }>;

export default async function PurchasePage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: purchase }, names] = await Promise.all([
    apiGet<Purchase>(`/admin/purchases/${id}`),
    adminNames(),
  ]);
  if (!purchase) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/purchases">
        ← All purchases
      </Link>
      <div className="page-header">
        <h1>
          {purchase.retailer}, {formatDate(purchase.purchased_on)}
        </h1>
      </div>

      <p className="field-hint">
        Recorded by {(purchase.created_by_id && names.get(purchase.created_by_id)) ?? "–"}.
      </p>
      {/* `key`: after each save the page reloads and the form starts fresh. */}
      <PurchaseEditForm key={purchase.version} purchase={purchase} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Gin</th>
              <th scope="col" className="num">
                Size
              </th>
              <th scope="col" className="num">
                Bottles
              </th>
              <th scope="col" className="num">
                Price each
              </th>
              <th scope="col" className="num">
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <Link href={`/juniper/gins/${line.gin.id}`}>{line.gin.display_name}</Link>
                </td>
                <td className="num">{line.size_ml} ml</td>
                <td className="num">{line.quantity}</td>
                <td className="num">
                  {line.unit_price ? formatMoney(line.unit_price, purchase.currency) : "Gift / unknown"}
                </td>
                <td className="num">{formatMoney(line.line_total, purchase.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4} className="num">
                Total
              </th>
              <td className="num">
                <strong>{formatMoney(purchase.total, purchase.currency)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {purchase.bottles_without_price > 0 && (
        <p className="field-hint">
          {purchase.bottles_without_price} bottle{purchase.bottles_without_price === 1 ? " has" : "s have"} no
          price and {purchase.bottles_without_price === 1 ? "is" : "are"} not included in the total.
        </p>
      )}
    </>
  );
}
