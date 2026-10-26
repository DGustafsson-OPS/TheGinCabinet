// Turn a wishlist entry into a real purchase (spec §5 A08: "convert purchased
// entry to acquisition without deleting source notes").
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PurchaseForm from "@/components/admin/PurchaseForm";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page, WishlistItem } from "@/lib/types";

export const metadata: Metadata = { title: "Record wishlist purchase" };

type Params = Promise<{ id: string }>;

export default async function ConvertWishlistPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  // There's no single-item endpoint; the wanted list is short, so look it up there.
  const [wishlist, gins] = await Promise.all([
    apiGet<Page<WishlistItem>>("/admin/wishlist?status=wanted&page_size=100"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
  ]);
  const item = wishlist.data?.items.find((entry) => entry.id === id);
  if (!item) notFound();
  const ginOptions = (gins.data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <Link className="back-link" href="/admin/wishlist">
        ← Wishlist
      </Link>
      <div className="page-header">
        <h1>You bought {item.text}</h1>
      </div>
      {!item.gin && (
        <p className="alert alert-warning">
          This wish isn&apos;t linked to a catalogue gin. Pick the gin below, or{" "}
          <Link href="/admin/gins/new">add it to the catalogue</Link> first.
        </p>
      )}
      {item.notes && <p>Your notes: {item.notes}</p>}
      <div className="card">
        <PurchaseForm
          gins={ginOptions}
          mode={{ kind: "convert", wishlistItemId: item.id, version: item.version }}
          initialLine={{ gin_id: item.gin?.id ?? "", unit_price: item.target_price ?? "" }}
          defaultCurrency={item.currency ?? "SEK"}
        />
      </div>
    </>
  );
}
