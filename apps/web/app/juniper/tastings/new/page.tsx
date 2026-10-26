import type { Metadata } from "next";
import Link from "next/link";

import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Gin, Page } from "@/lib/types";

import TastingForm from "../TastingForm";

export const metadata: Metadata = { title: "New tasting" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewTastingPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const preselected = param((await searchParams).gin);
  const { data } = await apiGet<Page<Gin>>("/admin/gins?page_size=100");
  const gins = (data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }));

  return (
    <>
      <Link className="back-link" href="/juniper/tastings">
        ← All tastings
      </Link>
      <div className="page-header">
        <h1>New tasting</h1>
      </div>
      <div className="card">
        <TastingForm gins={gins} preselectedGin={preselected} />
      </div>
    </>
  );
}
