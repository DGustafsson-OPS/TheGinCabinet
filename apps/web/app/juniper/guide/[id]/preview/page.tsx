// Preview a guide page exactly as the website will show it, published or not.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GuideArticle from "@/components/GuideArticle";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { GuidePage, PublicGuidePage } from "@/lib/types";

export const metadata: Metadata = { title: "Preview guide page" };

type Params = Promise<{ id: string }>;

export default async function GuidePreviewPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;
  const [{ data: page }, { data: preview }] = await Promise.all([
    apiGet<GuidePage>(`/admin/guide/${id}`),
    apiGet<PublicGuidePage>(`/admin/guide/${id}/preview`),
  ]);
  if (!page || !preview) notFound();

  return (
    <>
      <div className="preview-banner" role="note">
        <span>
          Preview of the last saved version ·{" "}
          <span className={page.published ? "badge badge-public" : "badge badge-private"}>{page.published ? "Published" : "Draft"}</span>
        </span>
        <Link href={`/juniper/guide/${page.id}`}>← Back to the editor</Link>
      </div>
      <div style={{ background: "var(--color-cream)", marginTop: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
        <GuideArticle page={preview} />
      </div>
    </>
  );
}
