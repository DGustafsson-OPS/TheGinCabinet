"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Category, Post } from "@/lib/types";

export default function NewPostForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const post = await call<Post>("/admin/blog", "POST", {
        title: title.trim(),
        category_id: categoryId || null,
      });
      toast("Draft created. Start writing.");
      router.push(`/juniper/blog/${post.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. A morning at the distillery" />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">(none yet)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
