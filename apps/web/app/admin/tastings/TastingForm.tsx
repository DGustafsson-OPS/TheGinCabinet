"use client";
// Private tasting notes (spec §5 A05): context, nose/palate/finish, flavour
// sliders 0–5, overall rating, tonic, garnish and private notes.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConflictPanel from "@/components/admin/ConflictPanel";
import { ApiError, apiFetch } from "@/lib/api-client";
import { humanize, today } from "@/lib/format";
import {
  type Bottle,
  type ConflictDetails,
  FLAVOURS,
  type Flavour,
  type GinSummary,
  type Page,
  type Tasting,
} from "@/lib/types";

type Props = { gins: GinSummary[]; tasting?: Tasting; preselectedGin?: string };

const TEXT_FIELDS = ["context", "nose", "palate", "finish", "tonic", "garnish", "private_notes"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export default function TastingForm({ gins, tasting, preselectedGin }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [ginId, setGinId] = useState(tasting?.gin.id ?? preselectedGin ?? "");
  const [bottleId, setBottleId] = useState(tasting?.bottle_id ?? "");
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [tastedOn, setTastedOn] = useState(tasting?.tasted_on ?? today());
  const [rating, setRating] = useState(tasting?.rating ?? "");
  const [flavours, setFlavours] = useState<Partial<Record<Flavour, number>>>(tasting?.flavours ?? {});
  const [text, setText] = useState<Record<TextField, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f, tasting?.[f] ?? ""])) as Record<TextField, string>,
  );
  const [conflict, setConflict] = useState<ConflictDetails<Tasting> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // When the gin changes, load its bottles so one can be picked (optional).
  useEffect(() => {
    if (!ginId) return;
    let cancelled = false; // ignore the answer if the gin changed again meanwhile
    apiFetch<Page<Bottle>>(`/admin/bottles?gin_id=${ginId}&page_size=100`)
      .then((page) => !cancelled && setBottles(page.items))
      .catch(() => !cancelled && setBottles([]));
    return () => {
      cancelled = true;
    };
  }, [ginId]);

  function payload() {
    return {
      bottle_id: bottleId || null,
      tasted_on: tastedOn,
      rating: rating.trim() ? rating.replace(",", ".").trim() : null,
      flavours,
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, text[f].trim() || null])),
    };
  }

  async function save(force = false) {
    setBusy(true);
    setError(null);
    try {
      if (!tasting) {
        const created = await call<Tasting>("/admin/tastings", "POST", { gin_id: ginId, ...payload() });
        toast("Tasting saved.");
        router.push(`/admin/tastings/${created.id}`);
        return;
      }
      await call(`/admin/tastings/${tasting.id}${force ? "?force=true" : ""}`, "PATCH", {
        version: tasting.version,
        ...payload(),
      });
      toast("Saved.");
      setConflict(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<Tasting>);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const textArea = (field: TextField, label: string, hint?: string) => (
    <div className="field span-2">
      <label htmlFor={field}>{label}</label>
      <textarea
        id={field}
        value={text[field]}
        onChange={(event) => setText((current) => ({ ...current, [field]: event.target.value }))}
        aria-describedby={hint ? `${field}-hint` : undefined}
      />
      {hint && (
        <span id={`${field}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );

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

      <div className="form-grid">
        <div className="field">
          <label htmlFor="gin">Gin</label>
          <select
            id="gin"
            value={ginId}
            onChange={(event) => {
              setGinId(event.target.value);
              setBottleId("");
            }}
            disabled={Boolean(tasting)} // a tasting stays with its gin
            required
          >
            <option value="" disabled>
              Choose a gin…
            </option>
            {gins.map((gin) => (
              <option key={gin.id} value={gin.id}>
                {gin.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bottle">Bottle (optional)</label>
          <select id="bottle" value={bottleId} onChange={(event) => setBottleId(event.target.value)}>
            <option value="">(not a specific bottle)</option>
            {bottles.map((bottle) => (
              <option key={bottle.id} value={bottle.id}>
                #{bottle.id.slice(0, 8)} · {bottle.size_ml} ml · {bottle.status}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tasted_on">Tasted on</label>
          <input id="tasted_on" type="date" value={tastedOn} onChange={(e) => setTastedOn(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="rating">Overall rating (0–10)</label>
          <input
            id="rating"
            inputMode="decimal"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            placeholder="e.g. 8.5"
          />
        </div>
        {textArea("context", "Context", "How and where: neat or with tonic, glass, temperature, company…")}
        {textArea("nose", "Nose")}
        {textArea("palate", "Palate")}
        {textArea("finish", "Finish")}
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: "var(--space-4) 0" }}>
        <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Flavour profile (0–5)</legend>
        <div className="form-grid">
          {FLAVOURS.map((flavour) => (
            <div key={flavour} className="field">
              <label htmlFor={`flavour-${flavour}`}>
                {humanize(flavour)}: <output htmlFor={`flavour-${flavour}`}>{flavours[flavour] ?? 0}</output>
              </label>
              <input
                id={`flavour-${flavour}`}
                type="range"
                min={0}
                max={5}
                step={1}
                value={flavours[flavour] ?? 0}
                onChange={(event) =>
                  setFlavours((current) => ({ ...current, [flavour]: Number(event.target.value) }))
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="tonic">Tonic</label>
          <input id="tonic" value={text.tonic} onChange={(e) => setText((c) => ({ ...c, tonic: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="garnish">Garnish</label>
          <input id="garnish" value={text.garnish} onChange={(e) => setText((c) => ({ ...c, garnish: e.target.value }))} />
        </div>
        {textArea("private_notes", "Private notes", "Never published.")}
      </div>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy || !ginId}>
          {busy ? "Saving…" : tasting ? "Save changes" : "Save tasting"}
        </button>
      </div>
    </form>
  );
}
