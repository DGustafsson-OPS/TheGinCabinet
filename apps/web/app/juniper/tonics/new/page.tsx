import type { Metadata } from "next";
import Link from "next/link";

import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { Media, Page } from "@/lib/types";

import TonicForm from "../TonicForm";

export const metadata: Metadata = { title: "Add tonic" };

export default async function NewTonicPage() {
  await requireStaff();
  const { data } = await apiGet<Page<Media>>("/admin/media?page_size=100");
  return (
    <>
      <Link className="back-link" href="/juniper/tonics">
        ← All tonics
      </Link>
      <div className="page-header">
        <h1>Add tonic</h1>
      </div>
      <TonicForm media={mediaOptions(data?.items ?? [])} />
    </>
  );
}
