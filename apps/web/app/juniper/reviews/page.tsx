// A06 Reviews: draft list and published reviews (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import ReviewStatusBadge from "@/components/admin/ReviewStatusBadge";
import SearchBox from "@/components/admin/SearchBox";
import { formatDateTime, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Page, Review } from "@/lib/types";

export const metadata: Metadata = { title: "Reviews" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = { search: param(raw.search), status: param(raw.status) };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  const { data } = await apiGet<Page<Review>>(`/admin/reviews?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Reviews</h1>
        <Link className="button button-primary" href="/juniper/reviews/new">
          New review
        </Link>
      </div>

      <div className="toolbar">
        <SearchBox label="Search" placeholder="Title or gin" />
        <FilterSelect
          name="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "ready", label: "Ready to publish" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The reviews could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No reviews {filters.search || filters.status ? "match" : "yet"}.</p>
          {(filters.search || filters.status) && <Link href="/juniper/reviews">Clear the filters</Link>}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Review</th>
                  <th scope="col">Gin</th>
                  <th scope="col">Author</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last change</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <Link href={`/juniper/reviews/${review.id}`}>{review.title}</Link>
                    </td>
                    <td>{review.gin.display_name}</td>
                    <td>{review.author.display_name}</td>
                    <td>
                      <ReviewStatusBadge review={review} />
                    </td>
                    <td>{formatDateTime(review.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/reviews" params={filters} />
        </>
      )}
    </>
  );
}
