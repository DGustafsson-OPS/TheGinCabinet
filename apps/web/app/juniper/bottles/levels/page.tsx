// Update levels: every bottle in the cabinet in one table, to note how much
// is left, open sealed bottles and finish empty ones, then save all at once.
import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Bottle, Page } from "@/lib/types";

import LevelsEditor from "./LevelsEditor";

export const metadata: Metadata = { title: "Update levels" };

/** All sealed and open bottles. The API sends at most 100 at a time, so ask page by page. */
async function bottlesInCabinet(): Promise<Bottle[] | null> {
  const all: Bottle[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data } = await apiGet<Page<Bottle>>(`/admin/bottles?in_cabinet=true&page_size=100&page=${page}`);
    if (!data) return null;
    all.push(...data.items);
    if (all.length >= data.meta.total || data.items.length === 0) break;
  }
  // Grouped by gin, open bottles before sealed ones, then by size.
  return all.sort(
    (a, b) =>
      a.gin.display_name.localeCompare(b.gin.display_name) ||
      (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) ||
      a.size_ml - b.size_ml,
  );
}

export default async function LevelsPage() {
  await requireAdmin();
  const bottles = await bottlesInCabinet();

  return (
    <>
      <Link className="back-link" href="/juniper/bottles">
        ← All bottles
      </Link>
      <div className="page-header">
        <h1>Update levels</h1>
      </div>
      <p className="field-hint">
        Every bottle in the cabinet. Change how much is left, open a sealed bottle or mark an empty one as
        finished, then save everything at once. Each change is kept in the bottle&apos;s history.
      </p>
      {!bottles ? (
        <p className="alert alert-error" role="alert">
          The bottles could not be loaded.
        </p>
      ) : bottles.length === 0 ? (
        <div className="table-wrap empty-state">
          <p>No bottles in the cabinet yet.</p>
          <Link href="/juniper/bottles/new">Add bottles</Link>
        </div>
      ) : (
        <LevelsEditor bottles={bottles} />
      )}
    </>
  );
}
