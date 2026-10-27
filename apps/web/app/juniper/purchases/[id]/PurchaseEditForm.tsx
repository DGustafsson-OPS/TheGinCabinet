"use client";
// Correct a purchase: its date, shop, currency, receipt number, notes and the
// price of each line. Which gin, the bottle size and how many bottles can't
// change: saving the purchase created those bottles (edit or retire a bottle
// on its own page instead).

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import CurrencyOptions, { CURRENCY_LIST_ID } from "@/components/admin/CurrencyOptions";
import { ApiError } from "@/lib/api-client";
import type { Purchase } from "@/lib/types";

type Details = { purchased_on: string; retailer: string; currency: string; reference: string; notes: string };

const toDetails = (p: Purchase): Details => ({
  purchased_on: p.purchased_on,
  retailer: p.retailer,
  currency: p.currency,
  reference: p.reference ?? "",
  notes: p.notes ?? "",
});
const toPrices = (p: Purchase) => Object.fromEntries(p.lines.map((l) => [l.id, l.unit_price ?? ""]));

export default function PurchaseEditForm({ purchase }: { purchase: Purchase }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const original = toDetails(purchase);
  const originalPrices = toPrices(purchase);
  const [details, setDetails] = useState<Details>(original);
  const [prices, setPrices] = useState<Record<string, string>>(originalPrices);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changedFields = (Object.keys(details) as (keyof Details)[]).filter((f) => details[f] !== original[f]);
  const changedLines = purchase.lines.filter((l) => prices[l.id] !== originalPrices[l.id]);
  const dirty = changedFields.length > 0 || changedLines.length > 0;

  const set = (field: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [field]: e.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { version: purchase.version };
    for (const field of changedFields) {
      const value = details[field].trim();
      body[field] = field === "currency" ? value.toUpperCase() : value || null;
    }
    if (changedLines.length) {
      // A decimal comma is fine ("349,90"); an empty box means a gift / unknown price.
      body.line_prices = changedLines.map((l) => ({
        id: l.id,
        unit_price: prices[l.id].trim().replace(",", ".") || null,
      }));
    }
    try {
      await call(`/admin/purchases/${purchase.id}`, "PATCH", body);
      toast("Purchase saved.");
      router.refresh(); // the page reloads; `key` then starts this form fresh
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else saved this purchase meanwhile. Reload the page to see their version, then make your change again."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save} aria-label="Edit purchase" style={{ marginBottom: "var(--space-4)" }}>
      <UnsavedChangesGuard dirty={dirty} />
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="p-date">Date</label>
          <input id="p-date" type="date" value={details.purchased_on} onChange={set("purchased_on")} required />
        </div>
        <div className="field">
          <label htmlFor="p-shop">Shop</label>
          <input id="p-shop" value={details.retailer} onChange={set("retailer")} required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="p-currency">Currency</label>
          <input id="p-currency" list={CURRENCY_LIST_ID} value={details.currency} onChange={set("currency")} required maxLength={3} aria-describedby="p-currency-hint" />
          <span id="p-currency-hint" className="field-hint">
            3-letter code: EUR, SEK, GBP…
          </span>
          <CurrencyOptions />
        </div>
        <div className="field">
          <label htmlFor="p-reference">Receipt / order number</label>
          <input id="p-reference" value={details.reference} onChange={set("reference")} maxLength={120} />
        </div>
        <div className="field span-2">
          <label htmlFor="p-notes">Notes</label>
          <textarea id="p-notes" value={details.notes} onChange={set("notes")} />
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "var(--space-4) 0 0" }}>
        <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Price per bottle</legend>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Leave empty for a gift or an unknown price. The gin, size and number of bottles can&apos;t change here:
          edit or retire a bottle on its own page instead.
        </p>
        <div className="form-grid">
          {purchase.lines.map((line, index) => (
            <div className="field" key={line.id}>
              <label htmlFor={`p-price-${line.id}`}>
                Line {index + 1}: {line.gin.display_name}, {line.size_ml} ml × {line.quantity}
              </label>
              <input
                id={`p-price-${line.id}`}
                inputMode="decimal"
                value={prices[line.id]}
                onChange={(e) => setPrices((p) => ({ ...p, [line.id]: e.target.value }))}
                placeholder="Gift / unknown"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {dirty && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setDetails(original);
              setPrices(originalPrices);
            }}
          >
            Undo changes
          </button>
        )}
      </div>
    </form>
  );
}
