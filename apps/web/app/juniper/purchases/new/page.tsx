import type { Metadata } from "next";
import Link from "next/link";

import PurchaseForm from "@/components/admin/PurchaseForm";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page } from "@/lib/types";

export const metadata: Metadata = { title: "Record purchase" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewPurchasePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const preselected = param((await searchParams).gin);
  const { data } = await apiGet<Page<Gin>>("/admin/gins?page_size=100");
  const gins = (data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <Link className="back-link" href="/juniper/purchases">
        ← All purchases
      </Link>
      <div className="page-header">
        <h1>Record purchase</h1>
      </div>
      {gins.length === 0 ? (
        <p className="alert alert-warning">
          Add the gin to the catalogue first. <Link href="/juniper/gins/new">Add a gin</Link>
        </p>
      ) : (
        <div className="card">
          <PurchaseForm gins={gins} initialLine={preselected ? { gin_id: preselected } : undefined} />
        </div>
      )}
    </>
  );
}
