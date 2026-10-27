"use client";
// Shelf, origin and comments for a bottle, with the same conflict handling as gins.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConflictPanel from "@/components/admin/ConflictPanel";
import { ApiError } from "@/lib/api-client";
import type { BottleDetail, ConflictDetails } from "@/lib/types";

type Values = { shelf: string; source: string; acquired_on: string; comments: string };

const toValues = (b: BottleDetail): Values => ({
  shelf: b.shelf ?? "",
  source: b.source ?? "",
  acquired_on: b.acquired_on ?? "",
  comments: b.comments ?? "",
});

export default function BottleEditForm({ bottle }: { bottle: BottleDetail }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [values, setValues] = useState<Values>(() => toValues(bottle));
  const [conflict, setConflict] = useState<ConflictDetails<BottleDetail> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function save(force = false) {
    const original = toValues(bottle);
    const changes = Object.fromEntries(
      (Object.keys(values) as (keyof Values)[])
        .filter((key) => values[key] !== original[key])
        .map((key) => [key, values[key].trim() || null]),
    );
    if (Object.keys(changes).length === 0) {
      toast("Nothing to save.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/bottles/${bottle.id}${force ? "?force=true" : ""}`, "PATCH", {
        version: bottle.version,
        ...changes,
      });
      toast("Saved.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<BottleDetail>);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {conflict && (
        <ConflictPanel
          diff={conflict.diff}
          busy={busy}
          onKeepMine={() => save(true)}
          onTakeTheirs={() => router.refresh()}
        />
      )}
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="field">
        <label htmlFor="shelf">Shelf</label>
        <input id="shelf" value={values.shelf} onChange={set("shelf")} />
      </div>
      <div className="field">
        <label htmlFor="source">Where it came from</label>
        <input id="source" value={values.source} onChange={set("source")} />
      </div>
      <div className="field">
        <label htmlFor="acquired_on">Date acquired</label>
        <input id="acquired_on" type="date" value={values.acquired_on} onChange={set("acquired_on")} />
      </div>
      <div className="field">
        <label htmlFor="comments">Comments</label>
        <textarea id="comments" value={values.comments} onChange={set("comments")} />
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
