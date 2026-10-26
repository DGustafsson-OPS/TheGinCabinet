"use client";
// The one-field form: a name is enough to create a draft.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Cocktail } from "@/lib/types";

export default function NewCocktailForm() {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const recipe = await call<Cocktail>("/admin/cocktails", "POST", { title: title.trim() });
      toast("Draft created. Add ingredients and steps next.");
      router.push(`/juniper/cocktails/${recipe.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
      <form className="card" onSubmit={submit}>
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
        <div className="field">
          <label htmlFor="title">Name</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Classic Gin & Tonic" />
        </div>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </form>
  );
}
