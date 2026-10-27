import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireAdmin } from "@/lib/server-api";
import { mediaOptions } from "@/lib/media-options";
import type { Distillery, Media, Page } from "@/lib/types";

import GinForm from "../GinForm";

export const metadata: Metadata = { title: "Add gin" };

export default async function NewGinPage() {
  await requireAdmin();
  const [{ data }, media] = await Promise.all([
    apiGet<Page<Distillery>>("/admin/distilleries?page_size=100"),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
  ]);

  return (
    <>
      <Link className="back-link" href="/juniper/gins">
        ← All gins
      </Link>
      <div className="page-header">
        <h1>Add gin</h1>
      </div>
      <div className="card">
        <GinForm distilleries={data?.items ?? []} media={mediaOptions(media.data?.items ?? [])} />
      </div>
    </>
  );
}
