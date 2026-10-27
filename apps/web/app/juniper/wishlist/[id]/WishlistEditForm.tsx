"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import CurrencyOptions, { CURRENCY_LIST_ID } from "@/components/admin/CurrencyOptions";
import { ApiError } from "@/lib/api-client";
import type { GinSummary, WishlistItem } from "@/lib/types";

type Values = { gin_id: string; text: string; priority: string; target_price: string; currency: string; notes: string };

const toValues = (w: WishlistItem): Values => ({
  gin_id: w.gin?.id ?? "",
  text: w.text,
  priority: String(w.priority),
  target_price: w.target_price ?? "",
  currency: w.currency ?? "EUR",
  notes: w.notes ?? "",
});

export default function WishlistEditForm({ item, gins }: { item: WishlistItem; gins: GinSummary[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const original = toValues(item);
  const [values, setValues] = useState<Values>(original);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = (Object.keys(values) as (keyof Values)[]).filter((f) => values[f] !== original[f]);

  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/wishlist/${item.id}`, "PATCH", { version: item.version, ...body });
      toast(success);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else saved this item meanwhile. Reload the page to see their version, then make your change again."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {};
    for (const field of changed) {
      const value = values[field].trim();
      if (field === "priority") body.priority = Number(value);
      else if (field === "target_price") body.target_price = value.replace(",", ".") || null;
      else if (field === "currency") body.currency = value.toUpperCase() || null;
      else body[field] = value || null;
    }
    // A target price needs a currency.
    if (values.target_price.trim() && !("currency" in body) && !item.currency) body.currency = values.currency.toUpperCase();
    send(body, "Wishlist item saved.");
  }

  return (
    <form className="card" onSubmit={save} aria-label="Edit wishlist item">
      <UnsavedChangesGuard dirty={changed.length > 0} />
      {item.status === "dropped" && (
        <div className="alert alert-warning">
          This item was dropped.{" "}
          <button type="button" className="link-button" disabled={busy} onClick={() => send({ status: "wanted" }, "Back on the wishlist.")}>
            Move it back to the wishlist
          </button>
        </div>
      )}
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="w-gin">Gin from the catalogue</label>
          <select id="w-gin" value={values.gin_id} onChange={set("gin_id")}>
            <option value="">(not in the catalogue yet)</option>
            {gins.map((gin) => (
              <option key={gin.id} value={gin.id}>
                {gin.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-text">Description</label>
          <input id="w-text" value={values.text} onChange={set("text")} required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="w-priority">Priority</label>
          <select id="w-priority" value={values.priority} onChange={set("priority")}>
            <option value="1">Must have</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
            <option value="4">Low</option>
            <option value="5">Someday</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-price">Target price</label>
          <input id="w-price" value={values.target_price} onChange={set("target_price")} inputMode="decimal" />
        </div>
        <div className="field">
          <label htmlFor="w-currency">Currency</label>
          <input id="w-currency" list={CURRENCY_LIST_ID} value={values.currency} onChange={set("currency")} maxLength={3} />
          <CurrencyOptions />
        </div>
        <div className="field span-2">
          <label htmlFor="w-notes">Notes</label>
          <textarea id="w-notes" value={values.notes} onChange={set("notes")} />
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
