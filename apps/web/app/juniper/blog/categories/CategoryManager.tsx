"use client";
// Edit categories in place, add new ones, and delete empty ones. Each row is
// its own little form, so saving one never touches the others.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import type { Category } from "@/lib/types";

type Values = { name: string; slug: string; description: string; display_order: string };

const toValues = (c?: Category): Values => ({
  name: c?.name ?? "",
  slug: c?.slug ?? "",
  description: c?.description ?? "",
  display_order: String(c?.display_order ?? 0),
});

const toPayload = (v: Values) => ({
  name: v.name.trim(),
  slug: v.slug.trim() || null,
  description: v.description.trim() || null,
  display_order: Number(v.display_order || 0),
});

function CategoryForm({ category }: { category?: Category }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [values, setValues] = useState<Values>(() => toValues(category));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (category) {
        await call(`/admin/blog/categories/${category.id}`, "PATCH", { version: category.version, ...toPayload(values) });
        toast(`Saved “${values.name}”.`);
      } else {
        await call("/admin/blog/categories", "POST", toPayload(values));
        toast(`Added “${values.name}”.`);
        setValues(toValues());
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await call(`/admin/blog/categories/${category!.id}`, "DELETE");
      toast(`Deleted “${category!.name}”.`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="card" onSubmit={save} aria-label={category ? `Category ${category.name}` : "New category"}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={values.name} onChange={set("name")} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-slug`}>URL name (slug)</label>
          <input id={`${id}-slug`} value={values.slug} onChange={set("slug")} placeholder="created from the name" />
        </div>
        <div className="field span-2">
          <label htmlFor={`${id}-description`}>Description</label>
          <input id={`${id}-description`} value={values.description} onChange={set("description")} maxLength={1000} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-order`}>Order</label>
          <input id={`${id}-order`} type="number" min={0} max={1000} value={values.display_order} onChange={set("display_order")} />
          <span className="field-hint">Lower numbers come first.</span>
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : category ? "Save" : "Add category"}
        </button>
        {category && (
          <>
            <span className="field-hint">
              {category.post_count} article{category.post_count === 1 ? "" : "s"}
            </span>
            <ConfirmButton
              label="Delete"
              title={`Delete “${category.name}”?`}
              description="Only categories without articles can be deleted."
              confirmLabel="Delete"
              danger
              onConfirm={remove}
            />
          </>
        )}
      </div>
    </form>
  );
}

export default function CategoryManager({ categories }: { categories: Category[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      {categories.map((category) => (
        <CategoryForm key={category.id} category={category} />
      ))}
      <h2 style={{ fontSize: "var(--font-size-h3)", marginBottom: 0 }}>Add a category</h2>
      <CategoryForm />
    </div>
  );
}
