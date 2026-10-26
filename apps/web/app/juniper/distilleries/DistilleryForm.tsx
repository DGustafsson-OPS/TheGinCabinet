"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Distillery } from "@/lib/types";

export default function DistilleryForm() {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    // `|| null` turns an empty text box into "no value" for the API.
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      const created = await call<Distillery>("/admin/distilleries", "POST", {
        name: text("name"),
        country: text("country"),
        region: text("region"),
        website: text("website"),
        description: text("description"),
      });
      toast(`${created.name} was added.`);
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
          <label htmlFor="d-name">Name</label>
          <input id="d-name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="d-country">Country</label>
          <input id="d-country" name="country" />
        </div>
        <div className="field">
          <label htmlFor="d-region">Region</label>
          <input id="d-region" name="region" />
        </div>
        <div className="field">
          <label htmlFor="d-website">Website</label>
          <input id="d-website" name="website" type="url" placeholder="https://" />
        </div>
        <div className="field span-2">
          <label htmlFor="d-description">Description</label>
          <textarea id="d-description" name="description" />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add distillery"}
        </button>
      </div>
    </form>
  );
}
