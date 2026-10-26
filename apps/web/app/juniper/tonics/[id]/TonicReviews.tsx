"use client";
// The reviews of one tonic. Each review is a small form of its own: rating,
// tasting notes and "pairs well with". A review is a draft until you publish
// it (publishing needs a rating and notes). Either admin can add one.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { AdminName, Tonic, TonicReview } from "@/lib/types";

function ReviewCard({ review, authors }: { review: TonicReview; authors: AdminName[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [rating, setRating] = useState(review.rating ?? "");
  const [notes, setNotes] = useState(review.notes ?? "");
  const [pairsWith, setPairsWith] = useState(review.pairs_with ?? "");
  const [authorId, setAuthorId] = useState(review.author.id);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const live = review.status === "published";

  async function save(status?: "draft" | "published") {
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/tonic-reviews/${review.id}`, "PATCH", {
        version: review.version,
        rating: rating.trim() ? rating.replace(",", ".").trim() : null,
        notes: notes.trim() || null,
        pairs_with: pairsWith.trim() || null,
        author_id: authorId,
        ...(status && { status }),
      });
      toast(status === "published" ? "Published. It's on the tonic's page." : status === "draft" ? "Unpublished." : "Review saved.");
      router.refresh();
    } catch (err) {
      setError({
        message:
          err instanceof ApiError && err.code === "version_conflict"
            ? "Someone else changed this review meanwhile. Reload the page."
            : errorMessage(err),
        items: err instanceof ApiError && Array.isArray(err.details) ? (err.details as string[]) : [],
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await call(`/admin/tonic-reviews/${review.id}`, "DELETE");
      toast("Review deleted.");
      router.refresh();
    } catch (err) {
      setError({ message: errorMessage(err), items: [] });
    }
  }

  return (
    <form
      className="card"
      aria-label={`Review by ${review.author.display_name}`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p style={{ marginTop: 0 }}>
        <span className={`badge ${live ? "badge-public" : "badge-private"}`}>
          {live ? `Published ${formatDate(review.published_at)}` : "Draft · not public"}
        </span>
      </p>
      <div role="alert">
        {error && (
          <div className="alert alert-error">
            <p style={{ margin: 0 }}>{error.message}</p>
            {error.items.length > 0 && (
              <ul style={{ margin: 0 }}>
                {error.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-rating`}>Rating (0–10)</label>
          <input id={`${id}-rating`} inputMode="decimal" value={rating} onChange={(e) => setRating(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-author`}>Reviewer</label>
          <select id={`${id}-author`} value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor={`${id}-notes`}>Tasting notes</label>
          <textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${id}-pairs`}>Pairs well with</label>
          <input id={`${id}-pairs`} value={pairsWith} onChange={(e) => setPairsWith(e.target.value)} maxLength={300} placeholder="e.g. citrus-forward London dry gins" />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          Save review
        </button>
        {live ? (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => save("draft")}>
            Unpublish
          </button>
        ) : (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => save("published")}>
            Save and publish
          </button>
        )}
        <ConfirmButton
          label="Delete review"
          title="Delete this review?"
          description="It is removed for good."
          confirmLabel="Delete"
          danger
          onConfirm={remove}
        />
      </div>
    </form>
  );
}

export default function TonicReviews({ tonic, authors }: { tonic: Tonic; authors: AdminName[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [busy, setBusy] = useState(false);

  async function addReview() {
    setBusy(true);
    try {
      await call(`/admin/tonics/${tonic.id}/reviews`, "POST", {});
      toast("New draft review added below.");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTonic() {
    try {
      await call(`/admin/tonics/${tonic.id}`, "DELETE");
      toast(`${tonic.display_name} was deleted.`);
      router.push("/juniper/tonics");
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <>
      <section aria-labelledby="tonic-reviews-title" style={{ marginTop: "var(--space-6)" }}>
        <div className="page-header">
          <h2 id="tonic-reviews-title" style={{ fontSize: "var(--font-size-h3)", margin: 0 }}>
            Reviews
          </h2>
          <button type="button" className="button button-primary" onClick={addReview} disabled={busy}>
            Add a review
          </button>
        </div>
        {tonic.reviews.length === 0 ? (
          <p className="empty-state">No reviews yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {tonic.reviews.map((review) => (
              // `key` includes the version: after a save the card starts fresh.
              <ReviewCard key={`${review.id}-${review.version}`} review={review} authors={authors} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="tonic-danger-title" style={{ marginTop: "var(--space-6)" }}>
        <h2 id="tonic-danger-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Remove this tonic
        </h2>
        <ConfirmButton
          label="Delete tonic"
          title={`Delete ${tonic.display_name}?`}
          description="The tonic and all its reviews are removed for good. To just hide it, untick “Show on the public website” instead."
          confirmLabel="Delete"
          danger
          onConfirm={deleteTonic}
        />
      </section>
    </>
  );
}
