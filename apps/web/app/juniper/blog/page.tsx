// A11 Journal article list (spec §10A): search, filters and bulk archive.
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { AdminName, Category, Page, Post } from "@/lib/types";

import PostTable from "./PostTable";

export const metadata: Metadata = { title: "Journal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JournalAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = {
    search: param(raw.search),
    status: param(raw.status),
    category_id: param(raw.category_id),
    author_id: param(raw.author_id),
  };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const [{ data }, categories, authors] = await Promise.all([
    apiGet<Page<Post>>(`/admin/blog?${query}`),
    apiGet<Category[]>("/admin/blog/categories"),
    apiGet<AdminName[]>("/admin/users"),
  ]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="page-header">
        <h1>Journal</h1>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <Link className="button button-secondary" href="/juniper/blog/categories">
            Categories
          </Link>
          <Link className="button button-primary" href="/juniper/blog/new">
            New article
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Title or summary" />
        <FilterSelect
          name="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "scheduled", label: "Scheduled" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <FilterSelect
          name="category_id"
          label="Category"
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          name="author_id"
          label="Author"
          options={(authors.data ?? []).map((a) => ({ value: a.id, label: a.display_name }))}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The articles could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No articles {filtered ? "match" : "yet"}.</p>
          {filtered && <Link href="/juniper/blog">Clear the filters</Link>}
        </div>
      ) : (
        <>
          <PostTable posts={data.items} />
          <Pagination meta={data.meta} basePath="/juniper/blog" params={filters} />
        </>
      )}
    </>
  );
}
