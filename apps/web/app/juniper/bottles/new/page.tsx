// Add bottles that weren't bought in a recorded purchase: gifts, older bottles...
import type { Metadata } from "next";
import Link from "next/link";

import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page } from "@/lib/types";

import NewBottleForm from "./NewBottleForm";

export const metadata: Metadata = { title: "Add bottles" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewBottlePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const preselected = param((await searchParams).gin);
  const { data } = await apiGet<Page<Gin>>("/admin/gins?page_size=100");
  const gins = data?.items ?? [];

  return (
    <>
      <Link className="back-link" href="/juniper/bottles">
        ← All bottles
      </Link>
      <div className="page-header">
        <h1>Add bottles</h1>
      </div>
      <p>
        Bought something? <Link href="/juniper/purchases/new">Record a purchase</Link> instead: it
        creates the bottles and keeps the price for the inventory value.
      </p>
      {gins.length === 0 ? (
        <p className="alert alert-warning">
          Add the gin to the catalogue first. <Link href="/juniper/gins/new">Add a gin</Link>
        </p>
      ) : (
        <div className="card">
          <NewBottleForm
            gins={gins.map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }))}
            preselected={preselected}
          />
        </div>
      )}
    </>
  );
}
