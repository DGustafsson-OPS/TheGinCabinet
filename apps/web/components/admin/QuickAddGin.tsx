"use client";
// "Add a new gin" right where a gin is chosen (recording a purchase), so a
// gin that isn't in the catalogue yet doesn't mean leaving a half-filled
// form. Only brand, name and ABV are asked for; the distillery, photos and
// the rest can be added later on the gin's own page.
//
// Like PhotoUpload, it is not a <form> of its own (forms can't be nested).

import { useId, useRef, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Gin, GinSummary } from "@/lib/types";

export default function QuickAddGin({ onAdded }: { onAdded: (gin: GinSummary) => void }) {
  const { call, toast } = useAdmin();
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [abv, setAbv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    if (!brand.trim() || !name.trim() || !abv.trim()) return setError("Fill in brand, name and ABV.");
    setBusy(true);
    try {
      const gin = await call<Gin>("/admin/gins", "POST", {
        brand: brand.trim(),
        name: name.trim(),
        abv: abv.replace(",", ".").trim(), // accepts a decimal comma: 41,5
      });
      onAdded({ id: gin.id, slug: gin.slug, display_name: gin.display_name });
      toast(`${gin.display_name} added to the catalogue and selected.`);
      setBrand("");
      setName("");
      setAbv("");
      if (details.current) details.current.open = false;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={details} className="photo-upload">
      <summary>Not in the list? Add a new gin…</summary>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-brand`}>New gin: brand</label>
          <input id={`${id}-brand`} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} placeholder="e.g. Hernö" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-name`}>New gin: name</label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Navy Strength" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-abv`}>New gin: ABV (%)</label>
          <input id={`${id}-abv`} value={abv} onChange={(e) => setAbv(e.target.value)} inputMode="decimal" placeholder="e.g. 41.5" />
        </div>
      </div>
      <p className="field-hint">The distillery, photos and description can be added later on the gin&apos;s page.</p>
      <button type="button" className="button button-secondary" onClick={add} disabled={busy}>
        {busy ? "Adding…" : "Add gin"}
      </button>
    </details>
  );
}
