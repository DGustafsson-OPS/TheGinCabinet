// A13 Journal categories (spec §10A): name, slug, description and order.
import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireStaff } from "@/lib/server-api";
import type { Category } from "@/lib/types";

import CategoryManager from "./CategoryManager";

export const metadata: Metadata = { title: "Journal categories" };

export default async function CategoriesPage() {
  await requireStaff();
  const { data } = await apiGet<Category[]>("/admin/blog/categories");
  return (
    <>
      <Link className="back-link" href="/juniper/blog">
        ← All articles
      </Link>
      <div className="page-header">
        <h1>Journal categories</h1>
      </div>
      {data ? (
        // `key`: start fresh whenever the list changes after a save.
        <CategoryManager key={data.map((c) => `${c.id}:${c.version}`).join()} categories={data} />
      ) : (
        <p className="alert alert-error" role="alert">
          The categories could not be loaded.
        </p>
      )}
    </>
  );
}
