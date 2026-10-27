"use client";
// One small form per text, grouped by page. Formatted texts show a live
// preview, drawn by the same component the website uses (FormattedText).

import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import FormattedText from "@/components/FormattedText";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { PageText } from "@/lib/types";

const PAGE_LINKS: Record<string, string> = {
  "Home page": "/",
  "About page": "/about",
  "Contact page": "/contact",
};

function TextForm({ text, onDirty }: { text: PageText; onDirty: (key: string, dirty: boolean) => void }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [value, setValue] = useState(text.value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = value !== text.value;

  function change(next: string) {
    setValue(next);
    onDirty(text.key, next !== text.value);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/page-texts/${text.key}`, "PATCH", { version: text.version, value });
      onDirty(text.key, false);
      toast(`Saved: ${text.label}.`);
      router.refresh(); // reloads the list; `key` below then resets this form
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else changed this text meanwhile. Copy your wording, reload the page and try again."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    try {
      await call(`/admin/page-texts/${text.key}?version=${text.version}`, "DELETE");
      onDirty(text.key, false);
      toast(`Back to the default: ${text.label}.`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const multiline = text.formatted || text.max_length > 200;
  return (
    <form onSubmit={save} className="card" aria-labelledby={`${id}-label`} style={{ marginBottom: "var(--space-4)" }}>
      <div className="field">
        <label id={`${id}-label`} htmlFor={`${id}-value`}>
          {text.label}
        </label>
        {multiline ? (
          <textarea
            id={`${id}-value`}
            value={value}
            onChange={(e) => change(e.target.value)}
            rows={text.formatted ? Math.min(18, Math.max(4, value.split("\n").length + 1)) : 3}
            maxLength={text.max_length}
            aria-describedby={`${id}-hint`}
          />
        ) : (
          <input id={`${id}-value`} value={value} onChange={(e) => change(e.target.value)} maxLength={text.max_length} aria-describedby={`${id}-hint`} />
        )}
        <span id={`${id}-hint`} className="field-hint">
          {text.hint && `${text.hint} `}
          {value.length} / {text.max_length} characters ·{" "}
          {text.customised
            ? `changed${text.updated_by ? ` by ${text.updated_by}` : ""}${text.updated_at ? ` on ${formatDateTime(text.updated_at)}` : ""}`
            : "the default text"}
        </span>
      </div>
      {text.formatted && (
        <details>
          <summary>Preview</summary>
          <div className="prose-preview">
            <FormattedText text={value} />
          </div>
        </details>
      )}
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy || !dirty || !value.trim()}>
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        {dirty && (
          <button type="button" className="button button-secondary" onClick={() => change(text.value)}>
            Undo changes
          </button>
        )}
        {text.customised && (
          <ConfirmButton
            label="Reset to default"
            title={`Reset "${text.label}" to the default?`}
            description={`The current wording is replaced by the original default text: "${text.default.slice(0, 160)}${text.default.length > 160 ? "…" : ""}"`}
            confirmLabel="Reset to default"
            danger
            quiet
            onConfirm={reset}
          />
        )}
      </div>
    </form>
  );
}

export default function PageTextsEditor({ texts }: { texts: PageText[] }) {
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const onDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      if (current.has(key) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const pages = [...new Set(texts.map((t) => t.page))];

  return (
    <>
      <UnsavedChangesGuard dirty={dirtyKeys.size > 0} />
      {pages.map((page) => (
        <section key={page} aria-labelledby={`page-${page}`} style={{ marginTop: "var(--space-6)" }}>
          <h2 id={`page-${page}`} style={{ fontSize: "var(--font-size-h3)" }}>
            {page}{" "}
            {PAGE_LINKS[page] && (
              <a href={PAGE_LINKS[page]} target="_blank" rel="noopener" className="field-hint" style={{ fontWeight: 400 }}>
                (open the page)
              </a>
            )}
          </h2>
          {texts
            .filter((t) => t.page === page)
            .map((text) => (
              // `key` with the version: after a save the form starts fresh from the new text.
              <TextForm key={`${text.key}:${text.version}`} text={text} onDirty={onDirty} />
            ))}
        </section>
      ))}
    </>
  );
}
