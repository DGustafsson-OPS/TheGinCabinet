// Audit viewer (spec A10, §9): who did what and when, newest first.
import type { Metadata } from "next";

import FilterSelect from "@/components/admin/FilterSelect";
import Pagination from "@/components/admin/Pagination";
import { ACTION_LABELS, describeEvent } from "@/lib/audit";
import { formatDateTime, humanize, param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { AuditEvent, Page } from "@/lib/types";

export const metadata: Metadata = { title: "Audit log" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const AREAS = ["user", "gin", "bottle", "purchase", "review", "cocktail", "blog_post", "media", "settings"];

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const filters = { action: param(raw.action), entity_type: param(raw.entity_type) };
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "50" });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const { data } = await apiGet<Page<AuditEvent>>(`/admin/audit?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Audit log</h1>
      </div>
      <div className="toolbar">
        <FilterSelect
          name="action"
          label="Action"
          options={[
            { value: "auth.login_failed", label: "Failed sign-in attempts" },
            ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label: humanize(label) })),
          ]}
        />
        <FilterSelect name="entity_type" label="Area" options={AREAS.map((a) => ({ value: a, label: humanize(a) }))} />
      </div>
      {!data ? (
        <p className="alert alert-error" role="alert">
          The audit log could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">No events match.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Area</th>
                  <th scope="col">IP address</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(event.occurred_at)}</td>
                    <td>{describeEvent(event)}</td>
                    <td>{humanize(event.entity_type)}</td>
                    <td>{event.ip_address ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} basePath="/juniper/audit" params={filters} />
        </>
      )}
    </>
  );
}
