// Revision history (spec A13): every save, autosave and status change, who
// made it (or "the scheduler"), and the article as it was at that moment.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTime, humanize } from "@/lib/format";
import { adminNames, apiGet, requireAdmin } from "@/lib/server-api";
import type { Post, PostBlock, Revision } from "@/lib/types";

export const metadata: Metadata = { title: "Article history" };

type Params = Promise<{ id: string }>;

/** A block as one line of plain text, for the history view. */
function blockText(block: PostBlock): string {
  switch (block.type) {
    case "heading":
      return `## ${block.text}`;
    case "paragraph":
      return block.text;
    case "list":
      return block.items.map((item) => `• ${item}`).join("\n");
    case "quote":
      return `“${block.text}”${block.cite ? ` — ${block.cite}` : ""}`;
    case "image":
      return `[image${block.caption ? `: ${block.caption}` : ""}]`;
    case "card":
      return `[${block.kind} card]`;
  }
}

export default async function PostRevisionsPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: post }, { data: revisions }, names] = await Promise.all([
    apiGet<Post>(`/admin/blog/${id}`),
    apiGet<Revision[]>(`/admin/blog/${id}/revisions`),
    adminNames(),
  ]);
  if (!post || !revisions) notFound();

  return (
    <>
      <Link className="back-link" href={`/juniper/blog/${id}/edit`}>
        ← Back to the editor
      </Link>
      <div className="page-header">
        <h1>History of “{post.title}”</h1>
      </div>
      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
        {revisions.map((revision) => {
          const snap = revision.snapshot as { title?: string; excerpt?: string | null; body_blocks?: PostBlock[] };
          return (
            <li key={revision.id} className="card">
              <strong>
                #{revision.revision_number} · {revision.note ?? humanize(revision.status)}
              </strong>
              <div className="field-hint">
                {formatDateTime(revision.saved_at)} ·{" "}
                {revision.actor_id ? `by ${names.get(revision.actor_id) ?? "a former admin"}` : "by the scheduler"} · status:{" "}
                {humanize(revision.status)}
              </div>
              <details style={{ marginTop: "var(--space-2)" }}>
                <summary>Show the article as it was</summary>
                <h2 style={{ fontSize: "var(--font-size-h3)" }}>{snap.title}</h2>
                {snap.excerpt && <p>{snap.excerpt}</p>}
                <div style={{ whiteSpace: "pre-line" }}>
                  {(snap.body_blocks ?? []).map((block, index) => (
                    <p key={index}>{blockText(block)}</p>
                  ))}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </>
  );
}
