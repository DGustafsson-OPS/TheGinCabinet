"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import CurrencyOptions, { CURRENCY_LIST_ID } from "@/components/admin/CurrencyOptions";
import type { GinSummary } from "@/lib/types";

export default function WishlistAddForm({ gins }: { gins: GinSummary[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      await call("/admin/wishlist", "POST", {
        gin_id: text("gin_id"),
        text: text("text"),
        priority: Number(form.get("priority")),
        target_price: text("target_price")?.replace(",", ".") ?? null,
        currency: text("target_price") ? text("currency") : null,
        notes: text("notes"),
      });
      toast("Added to the wishlist.");
      formElement.reset();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="w-gin">Gin from the catalogue</label>
          <select id="w-gin" name="gin_id" defaultValue="">
            <option value="">(not in the catalogue yet)</option>
            {gins.map((gin) => (
              <option key={gin.id} value={gin.id}>
                {gin.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-text">…or describe it</label>
          <input id="w-text" name="text" placeholder="e.g. Ki No Bi Kyoto Dry Gin" />
        </div>
        <div className="field">
          <label htmlFor="w-priority">Priority</label>
          <select id="w-priority" name="priority" defaultValue="3">
            <option value="1">Must have</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
            <option value="4">Low</option>
            <option value="5">Someday</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-price">Target price</label>
          <input id="w-price" name="target_price" inputMode="decimal" />
        </div>
        <div className="field">
          <label htmlFor="w-currency">Currency</label>
          <input id="w-currency" name="currency" list={CURRENCY_LIST_ID} defaultValue="EUR" maxLength={3} />
          <CurrencyOptions />
        </div>
        <div className="field span-2">
          <label htmlFor="w-notes">Notes</label>
          <textarea id="w-notes" name="notes" />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add to wishlist"}
        </button>
      </div>
    </form>
  );
}
