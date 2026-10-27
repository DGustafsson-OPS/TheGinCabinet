// Revision history (spec A06): every save and status change, who did it, and
// what the review looked like at that moment.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTime, humanize } from "@/lib/format";
import { adminNames, apiGet, requireStaff } from "@/lib/server-api";
import type { Review, Revision } from "@/lib/types";

export const metadata: Metadata = { title: "Revision history" };

type Params = Promise<{ id: string }>;

const SHOWN_FIELDS = ["title", "rating", "intro", "nose", "palate", "finish", "tonic", "garnish", "verdict"];

export default async function RevisionsPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;
  const [{ data: review }, { data: revisions }, names] = await Promise.all([
    apiGet<Review>(`/admin/reviews/${id}`),
    apiGet<Revision[]>(`/admin/reviews/${id}/revisions`),
    adminNames(),
  ]);
  if (!review || !revisions) notFound();

  return (
    <>
      <Link className="back-link" href={`/juniper/reviews/${id}`}>
        ← Back to the editor
      </Link>
      <div className="page-header">
        <h1>History of “{review.title}”</h1>
      </div>
      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
        {revisions.map((revision) => (
          <li key={revision.id} className="card">
            <strong>
              #{revision.revision_number} · {revision.note ?? humanize(revision.status)}
            </strong>
            <div className="field-hint">
              {formatDateTime(revision.saved_at)}
              {revision.actor_id && names.get(revision.actor_id) && ` · by ${names.get(revision.actor_id)}`} ·
              status: {humanize(revision.status)}
            </div>
            {/* <details> is a built-in, keyboard-friendly "show more" toggle. */}
            <details style={{ marginTop: "var(--space-2)" }}>
              <summary>Show the review as it was</summary>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-2) var(--space-4)" }}>
                {SHOWN_FIELDS.map((field) => (
                  <div key={field} style={{ display: "contents" }}>
                    <dt>{humanize(field)}</dt>
                    <dd style={{ margin: 0, whiteSpace: "pre-line" }}>{String(revision.snapshot[field] ?? "–")}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}
