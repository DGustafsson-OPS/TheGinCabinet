"use client";
// The gin list in the admin: tick gins to make them public or private in one
// go, or add a bottle of a gin straight from its row.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { humanize } from "@/lib/format";
import type { Gin } from "@/lib/types";

export default function GinTable({ gins }: { gins: Gin[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const allSelected = selected.length === gins.length;

  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  async function setVisibility(publicVisible: boolean) {
    setBusy(true);
    try {
      const { changed } = await call<{ changed: number }>("/admin/gins/visibility", "POST", {
        ids: selected,
        public_visible: publicVisible,
      });
      const where = publicVisible ? "now on the website" : "now private";
      toast(changed === 0 ? `Those gins were already ${publicVisible ? "public" : "private"}.` : `${changed} gin${changed === 1 ? " is" : "s are"} ${where}.`);
      setSelected([]);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-4)", marginBottom: "var(--space-3)" }}>
        <label className="field-checkbox" style={{ margin: 0 }}>
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : gins.map((g) => g.id))} />
          Select all on this page
        </label>
        {selected.length > 0 && (
          // A labelled group, so screen readers announce what the buttons act on.
          <div role="group" aria-label={`With the ${selected.length} selected`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
            <span>{selected.length} selected:</span>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => setVisibility(true)}>
              Make public
            </button>
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => setVisibility(false)}>
              Make private
            </button>
            <button type="button" className="link-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Select</span>
              </th>
              <th scope="col">Gin</th>
              <th scope="col">Style</th>
              <th scope="col" className="num">
                ABV
              </th>
              <th scope="col">Country</th>
              <th scope="col" className="num">
                Bottles
              </th>
              <th scope="col" className="num">
                Rating
              </th>
              <th scope="col">Public site</th>
            </tr>
          </thead>
          <tbody>
            {gins.map((gin) => (
              <tr key={gin.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${gin.display_name}`}
                    checked={selected.includes(gin.id)}
                    onChange={() => toggle(gin.id)}
                  />
                </td>
                <td>
                  <Link href={`/juniper/gins/${gin.id}`}>{gin.display_name}</Link>
                  {gin.distillery && <div>{gin.distillery.name}</div>}
                </td>
                <td>{humanize(gin.style)}</td>
                <td className="num">{gin.abv} %</td>
                <td>{gin.country ?? "–"}</td>
                <td className="num">
                  {gin.bottles_in_cabinet}
                  {gin.bottles_total > gin.bottles_in_cabinet && (
                    <span title="Including finished or given-away bottles">
                      {" "}
                      / {gin.bottles_total}
                    </span>
                  )}
                  <div>
                    <Link href={`/juniper/bottles/new?gin=${gin.id}`} className="field-hint">
                      + Add bottle<span className="visually-hidden"> of {gin.display_name}</span>
                    </Link>
                  </div>
                </td>
                <td className="num">
                  {gin.review_rating ? (
                    <span title={`Average of ${gin.review_count} published review${gin.review_count === 1 ? "" : "s"}`}>
                      {gin.review_rating}
                    </span>
                  ) : (
                    "–"
                  )}
                  {gin.tasting_rating && (
                    <div className="field-hint" title={`Average of ${gin.tasting_count} tasting${gin.tasting_count === 1 ? "" : "s"}`}>
                      tastings {gin.tasting_rating}
                    </div>
                  )}
                </td>
                <td>
                  {gin.public_visible ? (
                    <span className="badge badge-public">Public</span>
                  ) : (
                    <span className="badge badge-private">Private</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
