"use client";
// The add/edit form for a gin (spec §5 A02). One component handles both:
// without `gin` it creates (POST), with `gin` it edits (PATCH).

import { useRouter } from "next/navigation";
import { useState } from "react";

import MediaImage from "@/components/MediaImage";
import ConflictPanel from "@/components/admin/ConflictPanel";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { humanize } from "@/lib/format";
import {
  type ConflictDetails,
  type DistillerySummary,
  GIN_STYLES,
  type Gin,
  type MediaSummary,
} from "@/lib/types";

// The form's own state: every value as the text you see in the inputs.
type Values = {
  brand: string;
  name: string;
  edition: string;
  slug: string;
  style: string;
  abv: string;
  country: string;
  distillery_id: string;
  botanicals: string; // comma-separated in the input
  image_ids: string[]; // photos, in order: the first is the main one
  description: string;
  public_visible: boolean;
};

function toValues(gin?: Gin): Values {
  return {
    brand: gin?.brand ?? "",
    name: gin?.name ?? "",
    edition: gin?.edition ?? "",
    slug: gin?.slug ?? "",
    style: gin?.style ?? "london_dry",
    abv: gin?.abv ?? "",
    country: gin?.country ?? "",
    distillery_id: gin?.distillery?.id ?? "",
    botanicals: gin?.botanicals.join(", ") ?? "",
    image_ids: gin?.images.map((image) => image.id) ?? [],
    description: gin?.description ?? "",
    public_visible: gin?.public_visible ?? false,
  };
}

/** Convert form text into the JSON the API expects (empty text → null). */
function toPayload(values: Values): Record<string, unknown> {
  return {
    brand: values.brand.trim(),
    name: values.name.trim(),
    edition: values.edition.trim(),
    slug: values.slug.trim() || null,
    style: values.style,
    abv: values.abv.replace(",", ".").trim(),
    country: values.country.trim() || null,
    distillery_id: values.distillery_id || null,
    botanicals: values.botanicals
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
    description: values.description.trim() || null,
    public_visible: values.public_visible,
    image_ids: values.image_ids,
  };
}

type MediaOption = MediaSummary & { label: string };
type Props = { gin?: Gin; distilleries: DistillerySummary[]; media: MediaOption[] };

export default function GinForm({ gin, distilleries, media }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [values, setValues] = useState<Values>(() => toValues(gin));
  const [version, setVersion] = useState(gin?.version ?? 0);
  const [original, setOriginal] = useState<Values>(() => toValues(gin));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictDetails<Gin> | null>(null);
  const [busy, setBusy] = useState(false);

  // A helper that returns an onChange handler for one field.
  const set =
    (field: keyof Values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = event.target;
      const value =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;
      setValues((current) => ({ ...current, [field]: value }));
    };

  async function save(force = false) {
    setBusy(true);
    setError(null);
    try {
      if (!gin) {
        const created = await call<Gin>("/admin/gins", "POST", toPayload(values));
        toast(`${created.display_name} was added.`);
        router.push(`/juniper/gins/${created.id}`);
        return;
      }
      // Send only what changed, so a conflict diff shows just your edits.
      const now = toPayload(values);
      const before = toPayload(original);
      const changes = Object.fromEntries(
        Object.entries(now).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])),
      );
      if (Object.keys(changes).length === 0) {
        toast("Nothing to save.");
        return;
      }
      const updated = await call<Gin>(
        `/admin/gins/${gin.id}${force ? "?force=true" : ""}`,
        "PATCH",
        { version, ...changes },
      );
      setVersion(updated.version);
      setOriginal(toValues(updated));
      setValues(toValues(updated));
      setConflict(null);
      toast("Saved.");
      router.refresh(); // update other parts of the page (e.g. the title)
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<Gin>);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function takeTheirs() {
    if (!conflict) return;
    setValues(toValues(conflict.current));
    setOriginal(toValues(conflict.current));
    setVersion(conflict.current.version);
    setConflict(null);
    toast("Loaded the saved version.");
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
          onTakeTheirs={takeTheirs}
        />
      )}
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <input id="brand" value={values.brand} onChange={set("brand")} required />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={values.name} onChange={set("name")} required />
        </div>
        <div className="field">
          <label htmlFor="edition">Edition</label>
          <input id="edition" value={values.edition} onChange={set("edition")} aria-describedby="edition-hint" />
          <span id="edition-hint" className="field-hint">
            Optional, e.g. &quot;Navy Strength&quot; or &quot;2024 release&quot;.
          </span>
        </div>
        <div className="field">
          <label htmlFor="abv">ABV (%)</label>
          <input id="abv" value={values.abv} onChange={set("abv")} inputMode="decimal" required />
        </div>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" value={values.style} onChange={set("style")}>
            {GIN_STYLES.map((style) => (
              <option key={style} value={style}>
                {humanize(style)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" value={values.country} onChange={set("country")} />
        </div>
        <div className="field">
          <label htmlFor="distillery">Distillery</label>
          <select id="distillery" value={values.distillery_id} onChange={set("distillery_id")}>
            <option value="">(none)</option>
            {distilleries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="slug">URL name (slug)</label>
          <input id="slug" value={values.slug} onChange={set("slug")} aria-describedby="slug-hint" />
          <span id="slug-hint" className="field-hint">
            Leave empty to create one from the name, e.g. hendricks-gin.
          </span>
        </div>
        <div className="field span-2">
          <label htmlFor="botanicals">Botanicals</label>
          <input
            id="botanicals"
            value={values.botanicals}
            onChange={set("botanicals")}
            aria-describedby="botanicals-hint"
          />
          <span id="botanicals-hint" className="field-hint">
            Separate with commas: juniper, coriander, angelica.
          </span>
        </div>
        <div className="field span-2">
          <label htmlFor="description">Description</label>
          <textarea id="description" value={values.description} onChange={set("description")} />
        </div>
        <fieldset className="span-2" style={{ border: "none", padding: 0, margin: "0 0 var(--space-3)" }}>
          <legend style={{ fontWeight: 600, fontSize: "var(--font-size-small)" }}>Photos</legend>
          {values.image_ids.length === 0 && <p className="field-hint">No photos yet.</p>}
          <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-2)" }}>
            {values.image_ids.map((id, index) => {
              const item = media.find((m) => m.id === id);
              const moveTo = (target: number) =>
                setValues((v) => {
                  const ids = [...v.image_ids];
                  [ids[index], ids[target]] = [ids[target], ids[index]];
                  return { ...v, image_ids: ids };
                });
              return (
                <li key={id} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
                  {item && <MediaImage media={{ ...item, alt: "" }} sizes="64px" className="photo-thumb" />}
                  <span style={{ flex: 1 }}>
                    {index === 0 ? "Main photo: " : `Photo ${index + 1}: `}
                    {item?.label ?? "Image"}
                  </span>
                  <button type="button" className="button button-secondary" disabled={index === 0} onClick={() => moveTo(index - 1)}>
                    Move up<span className="visually-hidden"> photo {index + 1}</span>
                  </button>
                  <ConfirmButton
                    quiet
                    label={<>Remove<span className="visually-hidden"> photo {index + 1}</span></>}
                    title={`Remove photo ${index + 1} from this gin?`}
                    description="The photo stays in the media library. It disappears from the form now; nothing is saved until you press Save."
                    confirmLabel="Remove photo"
                    onConfirm={() => setValues((v) => ({ ...v, image_ids: v.image_ids.filter((x) => x !== id) }))}
                  />
                </li>
              );
            })}
          </ol>
          <div className="field">
            <label htmlFor="add-photo">Add a photo from the media library</label>
            <select
              id="add-photo"
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (id) setValues((v) => ({ ...v, image_ids: [...v.image_ids, id] }));
              }}
            >
              <option value="">Choose a photo…</option>
              {media
                .filter((m) => !values.image_ids.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </select>
          </div>
        </fieldset>
        <div className="field-checkbox span-2">
          <input
            id="public_visible"
            type="checkbox"
            checked={values.public_visible}
            onChange={set("public_visible")}
          />
          <label htmlFor="public_visible">Show this gin on the public website</label>
        </div>
      </div>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : gin ? "Save changes" : "Add gin"}
        </button>
      </div>
    </form>
  );
}
