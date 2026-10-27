// Edit a wishlist item: which gin, priority, target price, notes, or bring a
// dropped one back. Items already bought are read-only (they became a purchase).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page, WishlistItem } from "@/lib/types";

import WishlistEditForm from "./WishlistEditForm";

export const metadata: Metadata = { title: "Edit wishlist item" };

type Params = Promise<{ id: string }>;

export default async function WishlistItemPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: item }, gins] = await Promise.all([
    apiGet<WishlistItem>(`/admin/wishlist/${id}`),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
  ]);
  if (!item) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/wishlist">
        ← Wishlist
      </Link>
      <div className="page-header">
        <h1>{item.text}</h1>
      </div>
      {item.status === "purchased" ? (
        <p className="alert alert-info">
          This was bought, so it&apos;s part of a purchase now.{" "}
          {item.purchase_id && <Link href={`/juniper/purchases/${item.purchase_id}`}>View the purchase</Link>}
        </p>
      ) : (
        // `key`: after each save the page reloads and the form starts fresh.
        <WishlistEditForm key={item.version} item={item} gins={gins.data?.items ?? []} />
      )}
    </>
  );
}
