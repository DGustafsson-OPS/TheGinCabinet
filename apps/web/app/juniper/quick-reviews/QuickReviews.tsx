"use client";
// The quick-review form (a gin in juniper berries, or a tonic in tonic
// bottles, plus a line or two) and the list of quick reviews below it, each
// editable in place or deletable.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import Junipers, { berriesText } from "@/components/Junipers";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { AdminName, QuickReview } from "@/lib/types";

type Option = { id: string; label: string; public: boolean };
type Kind = "gin" | "tonic";
type Props = {
  reviews: QuickReview[];
  gins: Option[];
  tonics: Option[];
  authors: AdminName[];
  me: string;
  startGin?: string;
  startTonic?: string;
};

// Gins are rated in juniper berries, tonics in little tonic bottles.
const SYMBOL = { gin: "juniper", tonic: "bottle" } as const;
const LABEL = { gin: "Junipers", tonic: "Tonic bottles" } as const;
const UNIT = { gin: "juniper berries", tonic: "tonic bottles" } as const;

/** 1 to 5 berries in halves, as a slider with the berries shown next to it. */
function BerryPicker({ value, onChange, kind }: { value: number; onChange: (v: number) => void; kind: Kind }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{LABEL[kind]}</label>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <input
          id={id}
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={value}
          aria-valuetext={`${value} out of 5 ${UNIT[kind]}`}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: "1 1 10rem", maxWidth: "16rem" }}
        />
        <Junipers berries={value} size="medium" showNumber symbol={SYMBOL[kind]} />
      </div>
    </div>
  );
}

export default function QuickReviews({ reviews, gins, tonics, authors, me, startGin, startTonic }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  // ?tonic=<id> opens the form on that tonic; otherwise it starts on gins.
  const tonicStart = startTonic && tonics.some((t) => t.id === startTonic) ? startTonic : "";
  const [kind, setKind] = useState<Kind>(tonicStart ? "tonic" : "gin");
  const [gin, setGin] = useState(startGin && gins.some((g) => g.id === startGin) ? startGin : "");
  const [tonic, setTonic] = useState(tonicStart);
  const options = kind === "gin" ? gins : tonics;
  const target = kind === "gin" ? gin : tonic;
  const setTarget = kind === "gin" ? setGin : setTonic;
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
        [kind === "gin" ? "gin_id" : "tonic_id"]: target,
        rating: String(rating),
        note: note.trim() || null,
        author_id: author,
      });
      toast(`Saved: ${berriesText(rating)} ${LABEL[kind].toLowerCase()} for ${options.find((o) => o.id === target)?.label}.`);
      setTarget("");
      setRating(4);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const chosen = options.find((o) => o.id === target);
  return (
    <>
      <form className="card" onSubmit={add} aria-label="Add a quick review">
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 var(--space-3)" }}>
          <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>What are you rating?</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)" }}>
            {(["gin", "tonic"] as const).map((k) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <input type="radio" name={`${id}-kind`} checked={kind === k} onChange={() => setKind(k)} />
                {k === "gin" ? "A gin (juniper berries)" : "A tonic (tonic bottles)"}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-target`}>{kind === "gin" ? "Gin" : "Tonic"}</label>
            <select id={`${id}-target`} value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="" disabled>
                Choose a {kind}…
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {chosen && !chosen.public && (
              <span className="field-hint">⚠ This {kind} is private: visitors won&apos;t see the review until it&apos;s public.</span>
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
          <BerryPicker value={rating} onChange={setRating} kind={kind} />
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
          <button className="button button-primary" type="submit" disabled={busy || !target}>
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
  // A quick review is of a gin or of a tonic: exactly one of the two is set.
  const kind: Kind = review.gin ? "gin" : "tonic";
  const name = (review.gin ?? review.tonic)?.display_name ?? "";
  const href = review.gin ? `/juniper/gins/${review.gin.id}` : `/juniper/tonics/${review.tonic?.id}`;
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
        <form onSubmit={save} aria-label={`Edit quick review of ${name}`}>
          <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
          <p style={{ marginTop: 0 }}>
            <strong>{name}</strong> · {review.author.display_name}
          </p>
          <div className="form-grid">
            <BerryPicker value={rating} onChange={setRating} kind={kind} />
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
              <Link href={href}>{name}</Link>
            </strong>
            <Junipers berries={review.rating} size="medium" showNumber symbol={SYMBOL[kind]} />
            <span className="field-hint">
              {review.author.display_name} · {formatDate(review.created_at)}
              {!review.public && ` · ${kind} is private`}
            </span>
          </div>
          {review.note && <p style={{ margin: "var(--space-2) 0 0" }}>{review.note}</p>}
          <div className="form-actions" style={{ marginTop: "var(--space-2)" }}>
            <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
              Edit<span className="visually-hidden"> quick review of {name}</span>
            </button>
            <ConfirmButton
              quiet
              label={<>Delete<span className="visually-hidden"> quick review of {name}</span></>}
              title={`Delete this quick review of ${name}?`}
              description={`It disappears from the ${kind}'s page, and the ${kind}'s rating is worked out again without it.`}
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
