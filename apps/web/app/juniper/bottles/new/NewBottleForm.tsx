"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Bottle, GinSummary } from "@/lib/types";

export default function NewBottleForm({
  gins,
  preselected,
}: {
  gins: GinSummary[];
  preselected?: string;
}) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [status, setStatus] = useState<"sealed" | "open">("sealed");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    const number = (key: string) => (text(key) === null ? null : Number(text(key)));
    setBusy(true);
    setError(null);
    try {
      const created = await call<Bottle[]>("/admin/bottles", "POST", {
        gin_id: text("gin_id"),
        size_ml: number("size_ml"),
        quantity: number("quantity"),
        status,
        remaining_ml: status === "open" ? number("remaining_ml") : null,
        shelf: text("shelf"),
        source: text("source"),
        acquired_on: text("acquired_on"),
        comments: text("comments"),
      });
      toast(created.length === 1 ? "Bottle added." : `${created.length} bottles added.`);
      router.push(created.length === 1 ? `/juniper/bottles/${created[0].id}` : "/juniper/bottles");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="gin_id">Gin</label>
          <select id="gin_id" name="gin_id" defaultValue={preselected ?? ""} required>
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
          <label htmlFor="size_ml">Size (ml)</label>
          <input id="size_ml" name="size_ml" type="number" min={1} max={10000} defaultValue={700} required />
        </div>
        <div className="field">
          <label htmlFor="quantity">How many bottles</label>
          <input id="quantity" name="quantity" type="number" min={1} max={24} defaultValue={1} required />
        </div>
        <div className="field">
          <label htmlFor="status">State</label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as "sealed" | "open")}
          >
            <option value="sealed">Sealed</option>
            <option value="open">Already open</option>
          </select>
        </div>
        {status === "open" && (
          <div className="field">
            <label htmlFor="remaining_ml">About how much is left (ml)</label>
            <input id="remaining_ml" name="remaining_ml" type="number" min={0} />
          </div>
        )}
        <div className="field">
          <label htmlFor="source">Where it came from</label>
          <input id="source" name="source" placeholder="e.g. gift from Erik" />
        </div>
        <div className="field">
          <label htmlFor="acquired_on">Date acquired</label>
          <input id="acquired_on" name="acquired_on" type="date" />
        </div>
        <div className="field">
          <label htmlFor="shelf">Shelf</label>
          <input id="shelf" name="shelf" />
        </div>
        <div className="field span-2">
          <label htmlFor="comments">Comments</label>
          <textarea id="comments" name="comments" />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add bottles"}
        </button>
      </div>
    </form>
  );
}
