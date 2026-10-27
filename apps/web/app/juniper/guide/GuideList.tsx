"use client";
// The guide pages in order, with "move up / move down" buttons (which save
// straight away) and a small form to add a page.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { formatDate } from "@/lib/format";
import type { GuidePage } from "@/lib/types";

export default function GuideList({ pages }: { pages: GuidePage[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const page = await call<GuidePage>("/admin/guide", "POST", { title: title.trim() });
      toast("Page added. Write its text, then publish it.");
      router.push(`/juniper/guide/${page.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }

  async function move(index: number, by: -1 | 1) {
    const ids = pages.map((p) => p.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]]; // swap with the neighbour
    setBusy(true);
    try {
      await call("/admin/guide/order", "POST", { ids });
      toast(`"${pages[index].title}" moved ${by < 0 ? "up" : "down"}.`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* A row: the title box takes the space, the button keeps its own width. */}
      <form
        onSubmit={add}
        aria-label="Add a guide page"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-3)", margin: "var(--space-4) 0" }}
      >
        <div className="field" style={{ flex: "1 1 20rem", marginBottom: 0 }}>
          <label htmlFor="new-guide-title">New page title</label>
          <input id="new-guide-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="e.g. Gin and food" />
        </div>
        <button className="button button-primary" type="submit" disabled={busy}>
          Add page
        </button>
      </form>

      {pages.length === 0 ? (
        <p className="table-wrap empty-state">No guide pages yet. Add the first one above.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">Status</th>
                <th scope="col">Last edited</th>
                <th scope="col">Order</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page, index) => (
                <tr key={page.id}>
                  <td>
                    <Link href={`/juniper/guide/${page.id}`}>{page.title}</Link>
                    {page.summary && <div className="field-hint">{page.summary}</div>}
                  </td>
                  <td>
                    <span className={page.published ? "badge badge-public" : "badge badge-private"}>{page.published ? "Published" : "Draft"}</span>
                  </td>
                  <td>
                    {formatDate(page.updated_at)}
                    {page.edited_by && <div className="field-hint">by {page.edited_by.display_name}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="button button-secondary" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${page.title} up`}>
                      ↑
                    </button>{" "}
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy || index === pages.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${page.title} down`}
                    >
                      ↓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
