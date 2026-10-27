// A07 Recipe catalogue (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { formatDateTime, humanize, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Cocktail, Page } from "@/lib/types";

export const metadata: Metadata = { title: "Cocktails" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CocktailsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = { search: param(raw.search), status: param(raw.status) };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  const { data } = await apiGet<Page<Cocktail>>(`/admin/cocktails?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Cocktails</h1>
        <Link className="button button-primary" href="/juniper/cocktails/new">
          New recipe
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Recipe name" />
        <FilterSelect
          name="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The recipes could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">No recipes {filters.search || filters.status ? "match" : "yet"}.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Recipe</th>
                  <th scope="col">Method</th>
                  <th scope="col" className="num">
                    Ingredients
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Last change</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>
                      <Link href={`/juniper/cocktails/${recipe.id}`}>{recipe.title}</Link>
                    </td>
                    <td>{humanize(recipe.method)}</td>
                    <td className="num">{recipe.ingredients.length}</td>
                    <td>
                      {recipe.status === "published" ? (
                        <span className="badge badge-public">Live on the site</span>
                      ) : (
                        <span className="badge badge-private">{humanize(recipe.status)}</span>
                      )}
                    </td>
                    <td>{formatDateTime(recipe.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/cocktails" params={filters} />
        </>
      )}
    </>
  );
}
