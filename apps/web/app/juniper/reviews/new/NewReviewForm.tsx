"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { GinSummary, Review, Tasting } from "@/lib/types";

type Props = { gins: GinSummary[]; tasting?: Tasting; preselectedGin?: string };

export default function NewReviewForm({ gins, tasting, preselectedGin }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [ginId, setGinId] = useState(tasting?.gin.id ?? preselectedGin ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const review = await call<Review>("/admin/reviews", "POST", {
        gin_id: ginId,
        title: title.trim(),
        // Copy the tasting's notes in as a starting point.
        ...(tasting && {
          tasting_id: tasting.id,
          nose: tasting.nose,
          palate: tasting.palate,
          finish: tasting.finish,
          tonic: tasting.tonic,
          garnish: tasting.garnish,
          rating: tasting.rating,
        }),
      });
      toast("Draft created.");
      router.push(`/juniper/reviews/${review.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="field">
        <label htmlFor="gin">Gin</label>
        <select id="gin" value={ginId} onChange={(e) => setGinId(e.target.value)} disabled={Boolean(tasting)} required>
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
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. A Swedish meadow in a glass" />
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy || !ginId}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
