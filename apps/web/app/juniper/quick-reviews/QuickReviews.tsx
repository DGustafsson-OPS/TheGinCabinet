"use client";
// The quick-review form (gin, berries, a line or two) and the list of quick
// reviews below it, each editable in place or deletable.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import Junipers, { berriesText } from "@/components/Junipers";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { AdminName, QuickReview } from "@/lib/types";

type GinOption = { id: string; label: string; public: boolean };
type Props = { reviews: QuickReview[]; gins: GinOption[]; authors: AdminName[]; me: string; startGin?: string };

/** 1 to 5 berries in halves, as a slider with the berries shown next to it. */
function BerryPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <input
          id={id}
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={value}
          aria-valuetext={`${value} out of 5 juniper berries`}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: "1 1 10rem", maxWidth: "16rem" }}
        />
        <Junipers berries={value} size="medium" showNumber />
      </div>
    </div>
  );
}

export default function QuickReviews({ reviews, gins, authors, me, startGin }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [gin, setGin] = useState(startGin && gins.some((g) => g.id === startGin) ? startGin : "");
  const [rating, setRating] = useState(4);
  const [note, setNote] = useState("");
  const [author, setAuthor] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call<QuickReview>("/admin/quick-reviews", "POST", {
        gin_id: gin,
        rating: String(rating),
        note: note.trim() || null,
        author_id: author,
      });
      toast(`Saved: ${berriesText(rating)} junipers for ${gins.find((g) => g.id === gin)?.label}.`);
      setGin("");
      setRating(4);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const chosen = gins.find((g) => g.id === gin);
  return (
    <>
      <form className="card" onSubmit={add} aria-label="Add a quick review">
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-gin`}>Gin</label>
            <select id={`${id}-gin`} value={gin} onChange={(e) => setGin(e.target.value)} required>
              <option value="" disabled>
                Choose a gin…
              </option>
              {gins.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            {chosen && !chosen.public && (
              <span className="field-hint">⚠ This gin is private: visitors won&apos;t see the review until it&apos;s public.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${id}-author`}>By</label>
            <select id={`${id}-author`} value={author} onChange={(e) => setAuthor(e.target.value)}>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </div>
          <BerryPicker value={rating} onChange={setRating} label="Junipers" />
          <div className="field">
            <label htmlFor={`${id}-note`}>A line or two (optional)</label>
            <input
              id={`${id}-note`}
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bright and citrusy; lovely with a light tonic."
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={busy || !gin}>
            {busy ? "Saving…" : "Save quick review"}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: "var(--font-size-h3)", marginTop: "var(--space-6)" }}>All quick reviews</h2>
      {reviews.length === 0 ? (
        <p className="empty-state">No quick reviews yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
          {reviews.map((review) => (
            <Row key={`${review.id}-${review.version}`} review={review} />
          ))}
        </ul>
      )}
    </>
  );
}

/** One quick review: shown, or edited in place. */
function Row({ review }: { review: QuickReview }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(Number(review.rating));
  const [note, setNote] = useState(review.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/quick-reviews/${review.id}`, "PATCH", {
        version: review.version,
        rating: String(rating),
        note: note.trim() || null,
      });
      toast("Saved.");
      router.refresh(); // the row comes back with a new version, and closes
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else changed this meanwhile. Reload the page to see their version."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card">
      {editing ? (
        <form onSubmit={save} aria-label={`Edit quick review of ${review.gin.display_name}`}>
          <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
          <p style={{ marginTop: 0 }}>
            <strong>{review.gin.display_name}</strong> · {review.author.display_name}
          </p>
          <div className="form-grid">
            <BerryPicker value={rating} onChange={setRating} label="Junipers" />
            <div className="field">
              <label htmlFor={`${id}-note`}>A line or two (optional)</label>
              <input id={`${id}-note`} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-4)", alignItems: "center" }}>
            <strong>
              <Link href={`/juniper/gins/${review.gin.id}`}>{review.gin.display_name}</Link>
            </strong>
            <Junipers berries={review.rating} size="medium" showNumber />
            <span className="field-hint">
              {review.author.display_name} · {formatDate(review.created_at)}
              {!review.gin_public && " · gin is private"}
            </span>
          </div>
          {review.note && <p style={{ margin: "var(--space-2) 0 0" }}>{review.note}</p>}
          <div className="form-actions" style={{ marginTop: "var(--space-2)" }}>
            <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
              Edit<span className="visually-hidden"> quick review of {review.gin.display_name}</span>
            </button>
            <ConfirmButton
              quiet
              label={<>Delete<span className="visually-hidden"> quick review of {review.gin.display_name}</span></>}
              title={`Delete this quick review of ${review.gin.display_name}?`}
              description="It disappears from the gin's page, and the gin's rating is worked out again without it."
              confirmLabel="Delete quick review"
              danger
              onConfirm={async () => {
                try {
                  await call(`/admin/quick-reviews/${review.id}`, "DELETE");
                  toast("Quick review deleted.");
                  router.refresh();
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            />
          </div>
        </>
      )}
    </li>
  );
}
