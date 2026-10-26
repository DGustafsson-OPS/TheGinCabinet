// Preview an article exactly as the public page will show it, whatever its
// status (spec §10A: draft preview needs a signed-in admin).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import JournalArticle from "@/components/JournalArticle";
import PostStatusBadge from "@/components/admin/PostStatusBadge";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Post, PublicPost } from "@/lib/types";

export const metadata: Metadata = { title: "Preview article" };

type Params = Promise<{ id: string }>;

export default async function PostPreviewPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: post }, { data: preview }] = await Promise.all([
    apiGet<Post>(`/admin/blog/${id}`),
    apiGet<PublicPost>(`/admin/blog/${id}/preview`),
  ]);
  if (!post || !preview) notFound();

  return (
    <>
      <div className="preview-banner" role="note">
        <span>
          Preview of the last saved version · <PostStatusBadge post={post} />
        </span>
        <Link href={`/juniper/blog/${post.id}/edit`}>← Back to the editor</Link>
      </div>
      <div style={{ background: "var(--color-cream)", marginTop: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
        <JournalArticle post={preview} />
      </div>
    </>
  );
}
