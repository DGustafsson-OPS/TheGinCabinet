import type { Metadata } from "next";
import Link from "next/link";

import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { Gin, Media, Page } from "@/lib/types";

import TonicForm from "../TonicForm";

export const metadata: Metadata = { title: "Add tonic" };

export default async function NewTonicPage() {
  await requireStaff();
  const [{ data }, gins] = await Promise.all([
    apiGet<Page<Media>>("/admin/media?page_size=100"),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
  ]);
  return (
    <>
      <Link className="back-link" href="/juniper/tonics">
        ← All tonics
      </Link>
      <div className="page-header">
        <h1>Add tonic</h1>
      </div>
      <TonicForm media={mediaOptions(data?.items ?? [])} gins={(gins.data?.items ?? []).map((g) => ({ id: g.id, label: g.display_name }))} />
    </>
  );
}
