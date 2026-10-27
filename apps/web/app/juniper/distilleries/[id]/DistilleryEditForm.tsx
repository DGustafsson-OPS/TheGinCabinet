"use client";
// Edit a distillery. The save carries the version you loaded, so if someone
// else saved in between you get a clear message instead of overwriting them.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import { ApiError } from "@/lib/api-client";
import type { Distillery } from "@/lib/types";

const FIELDS = ["name", "slug", "country", "region", "website", "description"] as const;
type Values = Record<(typeof FIELDS)[number], string>;

const toValues = (d: Distillery): Values => ({
  name: d.name,
  slug: d.slug,
  country: d.country ?? "",
  region: d.region ?? "",
  website: d.website ?? "",
  description: d.description ?? "",
});

export default function DistilleryEditForm({ distillery }: { distillery: Distillery }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const original = toValues(distillery);
  const [values, setValues] = useState<Values>(original);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = FIELDS.filter((f) => values[f] !== original[f]);

  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (changed.length === 0) return toast("Nothing to save.");
    setBusy(true);
    setError(null);
    // Only the changed fields are sent; an emptied box becomes "no value".
    const changes = Object.fromEntries(changed.map((f) => [f, values[f].trim() || null]));
    try {
      await call(`/admin/distilleries/${distillery.id}`, "PATCH", { version: distillery.version, ...changes });
      toast("Distillery saved.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else saved this distillery meanwhile. Reload the page to see their version, then make your change again."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save} aria-label="Edit distillery">
      <UnsavedChangesGuard dirty={changed.length > 0} />
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="d-name">Name</label>
          <input id="d-name" value={values.name} onChange={set("name")} required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="d-slug">URL name (slug)</label>
          <input id="d-slug" value={values.slug} onChange={set("slug")} required pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="d-slug-hint" />
          <span id="d-slug-hint" className="field-hint">
            The end of the public address. Changing it breaks old links to this distillery.
          </span>
        </div>
        <div className="field">
          <label htmlFor="d-country">Country</label>
          <input id="d-country" value={values.country} onChange={set("country")} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="d-region">Region</label>
          <input id="d-region" value={values.region} onChange={set("region")} maxLength={120} />
        </div>
        <div className="field span-2">
          <label htmlFor="d-website">Website</label>
          <input id="d-website" type="url" value={values.website} onChange={set("website")} placeholder="https://" maxLength={300} />
        </div>
        <div className="field span-2">
          <label htmlFor="d-description">Description</label>
          <textarea id="d-description" value={values.description} onChange={set("description")} />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy || changed.length === 0}>
          {busy ? "Saving…" : changed.length ? "Save changes" : "Saved"}
        </button>
        {changed.length > 0 && (
          <button type="button" className="button button-secondary" onClick={() => setValues(original)}>
            Undo changes
          </button>
        )}
      </div>
    </form>
  );
}
