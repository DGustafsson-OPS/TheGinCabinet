"use client";
// Add or edit a tonic. Without `tonic` it creates (POST), with it it edits
// (PATCH, with the version check that protects against two people saving at once).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { ApiError } from "@/lib/api-client";
import { humanize } from "@/lib/format";
import type { MediaOption } from "@/lib/media-options";
import { TONIC_STYLES, type Tonic } from "@/lib/types";

type Values = {
  brand: string; name: string; slug: string; style: string; country: string;
  flavour_notes: string; description: string; image_media_id: string; public_visible: boolean;
};

const toValues = (t?: Tonic): Values => ({
  brand: t?.brand ?? "",
  name: t?.name ?? "",
  slug: t?.slug ?? "",
  style: t?.style ?? "indian",
  country: t?.country ?? "",
  flavour_notes: t?.flavour_notes.join(", ") ?? "",
  description: t?.description ?? "",
  image_media_id: t?.image_media_id ?? "",
  public_visible: t?.public_visible ?? false,
});

const toPayload = (v: Values) => ({
  brand: v.brand.trim(),
  name: v.name.trim(),
  slug: v.slug.trim() || null,
  style: v.style,
  country: v.country.trim() || null,
  flavour_notes: v.flavour_notes.split(",").map((n) => n.trim()).filter(Boolean),
  description: v.description.trim() || null,
  image_media_id: v.image_media_id || null,
  public_visible: v.public_visible,
});

export default function TonicForm({ tonic, media }: { tonic?: Tonic; media: MediaOption[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [values, setValues] = useState<Values>(() => toValues(tonic));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set =
    (field: keyof Values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = event.target;
      const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
      setValues((v) => ({ ...v, [field]: value }));
    };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!tonic) {
        const created = await call<Tonic>("/admin/tonics", "POST", toPayload(values));
        toast(`${created.display_name} was added.`);
        router.push(`/juniper/tonics/${created.id}`);
        return;
      }
      await call<Tonic>(`/admin/tonics/${tonic.id}`, "PATCH", { version: tonic.version, ...toPayload(values) });
      toast("Saved.");
      router.refresh(); // the page reloads the tonic; `key` then starts this form fresh
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else saved this tonic meanwhile. Reload the page to see their version."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  const photo = media.find((m) => m.id === values.image_media_id);
  return (
    <form className="card" onSubmit={save}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <input id="brand" value={values.brand} onChange={set("brand")} required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={values.name} onChange={set("name")} required maxLength={160} placeholder="e.g. Indian Tonic" />
        </div>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" value={values.style} onChange={set("style")}>
            {TONIC_STYLES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" value={values.country} onChange={set("country")} maxLength={80} />
        </div>
        <div className="field span-2">
          <label htmlFor="flavour_notes">Flavour notes</label>
          <input id="flavour_notes" value={values.flavour_notes} onChange={set("flavour_notes")} aria-describedby="notes-hint" />
          <span id="notes-hint" className="field-hint">
            Separate with commas: quinine, citrus, dry.
          </span>
        </div>
        <div className="field span-2">
          <label htmlFor="description">Description</label>
          <textarea id="description" value={values.description} onChange={set("description")} />
        </div>
        <div className="field">
          <label htmlFor="image">Photo</label>
          <select id="image" value={values.image_media_id} onChange={set("image_media_id")}>
            <option value="">(no photo)</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Upload photos in the <Link href="/juniper/media">media library</Link>.
          </span>
          {photo && <MediaImage media={{ ...photo, alt: "" }} sizes="160px" className="photo-thumb" />}
        </div>
        <div className="field">
          <label htmlFor="slug">URL name (slug)</label>
          <input id="slug" value={values.slug} onChange={set("slug")} aria-describedby="slug-hint" />
          <span id="slug-hint" className="field-hint">
            Leave empty to create one from the name.
          </span>
        </div>
        <div className="field-checkbox span-2">
          <input id="public_visible" type="checkbox" checked={values.public_visible} onChange={set("public_visible")} />
          <label htmlFor="public_visible">Show this tonic on the public website</label>
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : tonic ? "Save changes" : "Add tonic"}
        </button>
      </div>
    </form>
  );
}
