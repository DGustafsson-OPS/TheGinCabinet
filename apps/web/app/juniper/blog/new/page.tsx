// Start an article with a title (and optionally a category), then write it
// in the editor. A server page, so requireStaff() can send visitors to /login.
import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireStaff } from "@/lib/server-api";
import type { Category } from "@/lib/types";

import NewPostForm from "./NewPostForm";

export const metadata: Metadata = { title: "New article" };

export default async function NewPostPage() {
  await requireStaff();
  const { data: categories } = await apiGet<Category[]>("/admin/blog/categories");
  return (
    <>
      <Link className="back-link" href="/juniper/blog">
        ← All articles
      </Link>
      <div className="page-header">
        <h1>New article</h1>
      </div>
      <NewPostForm categories={categories ?? []} />
    </>
  );
}
