import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Distillery, Page } from "@/lib/types";

import GinForm from "../GinForm";

export const metadata: Metadata = { title: "Add gin" };

export default async function NewGinPage() {
  await requireAdmin();
  const { data } = await apiGet<Page<Distillery>>("/admin/distilleries?page_size=100");

  return (
    <>
      <Link className="back-link" href="/admin/gins">
        ← All gins
      </Link>
      <div className="page-header">
        <h1>Add gin</h1>
      </div>
      <div className="card">
        <GinForm distilleries={data?.items ?? []} />
      </div>
    </>
  );
}
