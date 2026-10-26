"use client";
// The review editor (spec §5 A06): text blocks, author, rating, cover image,
// SEO fields, and the publishing workflow draft → ready → published → archived.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ConflictPanel from "@/components/admin/ConflictPanel";
import ReviewStatusBadge from "@/components/admin/ReviewStatusBadge";
import { ApiError } from "@/lib/api-client";
import type { ConflictDetails, MediaSummary, Person, Review, ReviewStatus } from "@/lib/types";

const TEXT_FIELDS = [
  "title", "slug", "rating", "intro", "nose", "palate", "finish",
  "tonic", "garnish", "verdict", "seo_title", "seo_description",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Values = Record<TextField, string> & { author_id: string; cover_media_id: string };

function toValues(review: Review): Values {
  const values = Object.fromEntries(TEXT_FIELDS.map((f) => [f, review[f] ?? ""])) as Record<TextField, string>;
  return { ...values, author_id: review.author.id, cover_media_id: review.cover_media_id ?? "" };
}

type MediaOption = MediaSummary & { label: string };
type Props = { review: Review; authors: Person[]; media: MediaOption[] };

export default function ReviewEditor({ review, authors, media }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const original = toValues(review);
  const [values, setValues] = useState<Values>(original);
  const [conflict, setConflict] = useState<ConflictDetails<Review> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Which fields differ from what was loaded? (Only those are sent.)
  const changed = (Object.keys(values) as (keyof Values)[]).filter((k) => values[k] !== original[k]);
  const dirty = changed.length > 0;

  const set =
    (field: keyof Values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));

  async function save(force = false) {
    if (!dirty) return toast("Nothing to save.");
    setBusy(true);
    setError(null);
    setProblems([]);
    const changes = Object.fromEntries(
      changed.map((field) => {
        const value = values[field].trim();
        return [field, field === "rating" ? value.replace(",", ".") || null : value || null];
      }),
    );
    try {
      await call(`/admin/reviews/${review.id}${force ? "?force=true" : ""}`, "PATCH", {
        version: review.version,
        ...changes,
      });
      setConflict(null);
      toast("Saved. A revision was recorded.");
      router.refresh(); // the page reloads the review; `key` then resets this form
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<Review>);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function move(status: ReviewStatus, success: string) {
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      await call(`/admin/reviews/${review.id}/status`, "POST", { version: review.version, status });
      toast(success);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_publishable") {
        setProblems(err.details as string[]);
      } else if (err instanceof ApiError && err.code === "version_conflict") {
        setError("Someone else changed this review. Reload the page before changing its status.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const cover = media.find((m) => m.id === values.cover_media_id);
  const counter = (field: "seo_title" | "seo_description", max: number) => (
    <span className="field-hint" aria-live="polite">
      {values[field].length} / {max} characters
    </span>
  );
  const textArea = (field: TextField, label: string, hint?: string) => (
    <div className="field span-2">
      <label htmlFor={field}>{label}</label>
      <textarea id={field} value={values[field]} onChange={set(field)} aria-describedby={hint ? `${field}-hint` : undefined} />
      {hint && (
        <span id={`${field}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );

  return (
    <>
      <section className="card" aria-labelledby="workflow-title" style={{ marginBottom: "var(--space-4)" }}>
        <h2 id="workflow-title" style={{ fontSize: "var(--font-size-h3)" }}>
          Status: <ReviewStatusBadge review={review} />
        </h2>
        {problems.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <p style={{ margin: 0 }}>
              <strong>Not ready to publish yet:</strong>
            </p>
            <ul style={{ margin: 0 }}>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {dirty && <p className="field-hint">Save your changes before changing the status.</p>}
        <div className="form-actions">
          {review.status === "draft" && (
            <button type="button" className="button button-secondary" disabled={busy || dirty} onClick={() => move("ready", "Marked ready to publish.")}>
              Mark ready
            </button>
          )}
          {review.status === "ready" && (
            <>
              <ConfirmButton
                label="Publish"
                title="Publish this review?"
                description="It will appear on the public website straight away."
                confirmLabel="Publish now"
                disabled={busy || dirty}
                onConfirm={() => move("published", "Published. It's live.")}
              />
              <button type="button" className="button button-secondary" disabled={busy || dirty} onClick={() => move("draft", "Back to draft.")}>
                Back to draft
              </button>
            </>
          )}
          {review.status === "published" && (
            <ConfirmButton
              label="Withdraw"
              title="Take this review off the website?"
              description="It goes back to draft. You can publish it again later."
              confirmLabel="Withdraw"
              disabled={busy || dirty}
              onConfirm={() => move("draft", "Withdrawn. It's no longer public.")}
            />
          )}
          {review.status !== "archived" && (
            <ConfirmButton
              label="Archive"
              title="Archive this review?"
              description="It leaves the website and the working lists. You can restore it to draft."
              confirmLabel="Archive"
              danger
              disabled={busy || dirty}
              onConfirm={() => move("archived", "Archived.")}
            />
          )}
          {review.status === "archived" && (
            <button type="button" className="button button-secondary" disabled={busy || dirty} onClick={() => move("draft", "Restored to draft.")}>
              Restore to draft
            </button>
          )}
          <Link className="button button-secondary" href={`/admin/reviews/${review.id}/preview`}>
            Preview
          </Link>
          <Link className="button button-secondary" href={`/admin/reviews/${review.id}/revisions`}>
            Revision history
          </Link>
          {review.status === "published" && review.gin_public && (
            <Link className="button button-secondary" href={`/reviews/${review.slug}`}>
              View on the site
            </Link>
          )}
        </div>
      </section>

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {conflict && (
          <ConflictPanel diff={conflict.diff} busy={busy} onKeepMine={() => save(true)} onTakeTheirs={() => router.refresh()} />
        )}
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="title">Title</label>
            <input id="title" value={values.title} onChange={set("title")} required />
          </div>
          <div className="field">
            <label htmlFor="author_id">Author (byline)</label>
            <select id="author_id" value={values.author_id} onChange={set("author_id")}>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rating">Rating (0–10)</label>
            <input id="rating" inputMode="decimal" value={values.rating} onChange={set("rating")} />
          </div>
          {textArea("intro", "Introduction", "Separate paragraphs with an empty line.")}
          {textArea("nose", "Nose")}
          {textArea("palate", "Palate")}
          {textArea("finish", "Finish")}
          <div className="field">
            <label htmlFor="tonic">Tonic</label>
            <input id="tonic" value={values.tonic} onChange={set("tonic")} />
          </div>
          <div className="field">
            <label htmlFor="garnish">Garnish</label>
            <input id="garnish" value={values.garnish} onChange={set("garnish")} />
          </div>
          {textArea("verdict", "Verdict", "The summary readers remember. Needed to publish.")}

          <div className="field span-2">
            <label htmlFor="cover_media_id">Cover image</label>
            <select id="cover_media_id" value={values.cover_media_id} onChange={set("cover_media_id")}>
              <option value="">(no cover image)</option>
              {media.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {cover && (
              <MediaImage media={cover} sizes="320px" className="cover-preview" />
            )}
            <span className="field-hint">
              Upload images in the <Link href="/admin/media">media library</Link>.
            </span>
          </div>

          <div className="field">
            <label htmlFor="slug">URL name (slug)</label>
            <input id="slug" value={values.slug} onChange={set("slug")} />
            <span className="field-hint">The page will be /reviews/{values.slug || "…"}</span>
          </div>
          <div className="field">
            <label htmlFor="seo_title">Search engine title</label>
            <input id="seo_title" value={values.seo_title} onChange={set("seo_title")} maxLength={70} />
            {counter("seo_title", 70)}
          </div>
          <div className="field span-2">
            <label htmlFor="seo_description">Search engine description</label>
            <textarea id="seo_description" value={values.seo_description} onChange={set("seo_description")} maxLength={170} />
            {counter("seo_description", 170)}
          </div>
        </div>

        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </form>
    </>
  );
}
