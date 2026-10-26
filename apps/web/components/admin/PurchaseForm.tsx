"use client";
// Record a purchase with one or more lines (spec §5 A04). Saving creates one
// bottle per unit. Also used to turn a wishlist entry into a purchase (A08).

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { formatMoney, today } from "@/lib/format";
import type { GinSummary, Purchase } from "@/lib/types";

type Line = { key: string; gin_id: string; size_ml: string; quantity: string; unit_price: string };

type Mode =
  | { kind: "create" }
  | { kind: "convert"; wishlistItemId: string; version: number };

type Props = {
  gins: GinSummary[];
  mode?: Mode;
  initialLine?: Partial<Omit<Line, "key">>;
  defaultCurrency?: string;
};

function emptyLine(key: string, initial: Partial<Omit<Line, "key">> = {}): Line {
  return { key, gin_id: "", size_ml: "700", quantity: "1", unit_price: "", ...initial };
}

export default function PurchaseForm({
  gins,
  mode = { kind: "create" },
  initialLine,
  defaultCurrency = "SEK",
}: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  // Row keys must be the same on the server and in the browser, so the first
  // row is always "init" and rows added later count up from this form's own
  // counter. (A shared module-level counter gave duplicate ids: see git history.)
  const formId = useId();
  const added = useRef(0);
  const [lines, setLines] = useState<Line[]>(() => [emptyLine("init", initialLine)]);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateLine = (key: string, field: keyof Omit<Line, "key">, value: string) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));

  // Running total of the lines that have a price (prices in cents avoid rounding errors).
  const totalCents = lines.reduce((sum, line) => {
    const price = Number(line.unit_price.replace(",", "."));
    return line.unit_price && !Number.isNaN(price)
      ? sum + Math.round(price * 100) * Number(line.quantity || 0)
      : sum;
  }, 0);
  const bottleCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    const purchase = {
      purchased_on: text("purchased_on"),
      retailer: text("retailer"),
      currency: currency.trim().toUpperCase(),
      reference: text("reference"),
      shelf: text("shelf"),
      notes: text("notes"),
      lines: lines.map((line) => ({
        gin_id: line.gin_id,
        size_ml: Number(line.size_ml),
        quantity: Number(line.quantity),
        unit_price: line.unit_price.trim() ? line.unit_price.replace(",", ".").trim() : null,
      })),
    };
    setBusy(true);
    setError(null);
    try {
      const saved =
        mode.kind === "create"
          ? await call<Purchase>("/admin/purchases", "POST", purchase)
          : await call<Purchase>(`/admin/wishlist/${mode.wishlistItemId}/convert`, "POST", {
              version: mode.version,
              purchase,
            });
      toast(`Purchase saved: ${bottleCount} bottle${bottleCount === 1 ? "" : "s"} added.`);
      router.push(`/juniper/purchases/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="purchased_on">Date</label>
          <input id="purchased_on" name="purchased_on" type="date" defaultValue={today()} required />
        </div>
        <div className="field">
          <label htmlFor="retailer">Shop</label>
          <input id="retailer" name="retailer" required placeholder="e.g. Systembolaget" />
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <input
            id="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            maxLength={3}
            required
            aria-describedby="currency-hint"
          />
          <span id="currency-hint" className="field-hint">
            3-letter code: SEK, EUR, GBP…
          </span>
        </div>
        <div className="field">
          <label htmlFor="reference">Receipt or order number</label>
          <input id="reference" name="reference" />
        </div>
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: "var(--space-4) 0" }}>
        <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>What was bought</legend>
        {lines.map((line, index) => (
          <div key={line.key} className="card" style={{ marginBottom: "var(--space-3)", padding: "var(--space-4)" }}>
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor={`${formId}-gin-${line.key}`}>Gin (line {index + 1})</label>
                <select
                  id={`${formId}-gin-${line.key}`}
                  value={line.gin_id}
                  onChange={(event) => updateLine(line.key, "gin_id", event.target.value)}
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
                <label htmlFor={`${formId}-size-${line.key}`}>
                  Size (ml)
                  {/* Hidden words give each line's fields a unique name for screen readers. */}
                  <span className="visually-hidden"> on line {index + 1}</span>
                </label>
                <input
                  id={`${formId}-size-${line.key}`}
                  type="number"
                  min={1}
                  value={line.size_ml}
                  onChange={(event) => updateLine(line.key, "size_ml", event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-qty-${line.key}`}>
                  Bottles
                  <span className="visually-hidden"> on line {index + 1}</span>
                </label>
                <input
                  id={`${formId}-qty-${line.key}`}
                  type="number"
                  min={1}
                  max={48}
                  value={line.quantity}
                  onChange={(event) => updateLine(line.key, "quantity", event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-price-${line.key}`}>
                  Price per bottle
                  <span className="visually-hidden"> on line {index + 1}</span>
                </label>
                <input
                  id={`${formId}-price-${line.key}`}
                  inputMode="decimal"
                  value={line.unit_price}
                  onChange={(event) => updateLine(line.key, "unit_price", event.target.value)}
                  aria-describedby={`${formId}-price-hint-${line.key}`}
                />
                <span id={`${formId}-price-hint-${line.key}`} className="field-hint">
                  Leave empty for a gift or an unknown price.
                </span>
              </div>
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              >
                Remove line {index + 1}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            added.current += 1;
            const key = `new-${added.current}`;
            setLines((current) => [...current, emptyLine(key)]);
          }}
        >
          Add another line
        </button>
      </fieldset>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="shelf">Shelf for the new bottles</label>
          <input id="shelf" name="shelf" />
        </div>
        <div className="field span-2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" />
        </div>
      </div>

      <p aria-live="polite">
        <strong>
          {bottleCount} bottle{bottleCount === 1 ? "" : "s"} ·{" "}
          {formatMoney((totalCents / 100).toFixed(2), currency.length === 3 ? currency.toUpperCase() : null)}
        </strong>
      </p>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save purchase"}
        </button>
      </div>
    </form>
  );
}
