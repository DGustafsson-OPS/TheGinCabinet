"use client";
// The image grid with tick boxes, and the actions for the ticked images:
// move to a folder, rename as a numbered series, set the photo credit, or
// delete (asks first; images still in use are skipped and listed).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import type { Media, MediaBulkResult } from "@/lib/types";

import styles from "./media.module.css";

type Action = "move" | "rename" | "credit" | "watermark_on" | "watermark_off" | "ai_on" | "ai_off";

// The corner-mark choices: which mark, and on or off.
const MARKS: Partial<Record<Action, { action: "watermark" | "ai_generated"; on: boolean; done: string }>> = {
  watermark_on: { action: "watermark", on: true, done: "Watermark added to" },
  watermark_off: { action: "watermark", on: false, done: "Watermark removed from" },
  ai_on: { action: "ai_generated", on: true, done: "AI-generated label added to" },
  ai_off: { action: "ai_generated", on: false, done: "AI-generated label removed from" },
};

export default function MediaBrowser({ items, folders }: { items: Media[]; folders: string[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [selected, setSelected] = useState<string[]>([]); // in the order shown
  const [action, setAction] = useState<Action>("move");
  const [folder, setFolder] = useState("");
  const [baseName, setBaseName] = useState("");
  const [credit, setCredit] = useState("");
  const [skipped, setSkipped] = useState<MediaBulkResult["skipped"]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (mediaId: string) =>
    setSelected((current) =>
      current.includes(mediaId) ? current.filter((x) => x !== mediaId) : items.map((m) => m.id).filter((x) => x === mediaId || current.includes(x)),
    );
  const allSelected = selected.length === items.length;

  async function run(body: Record<string, unknown>, done: (n: number) => string) {
    setBusy(true);
    setSkipped([]);
    try {
      const result = await call<MediaBulkResult>("/admin/media/bulk", "POST", { ids: selected, ...body });
      toast(done(result.changed));
      setSkipped(result.skipped);
      setSelected([]);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const s = (n: number) => `${n} image${n === 1 ? "" : "s"}`;
    if (action === "move") run({ action, folder: folder.trim() }, (n) => `${s(n)} moved to ${folder.trim() || "no folder"}.`);
    if (action === "rename") run({ action, base_name: baseName }, (n) => `${s(n)} renamed.`);
    if (action === "credit") run({ action, credit }, (n) => `Credit set on ${s(n)}.`);
    const mark = MARKS[action];
    if (mark) run({ action: mark.action, on: mark.on }, (n) => `${mark.done} ${s(n)}.`);
  }

  return (
    <>
      <div className={styles.selectBar}>
        <label className="field-checkbox" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : items.map((m) => m.id))}
          />
          Select all on this page
        </label>
        {selected.length > 0 && <span>{selected.length} selected</span>}
      </div>

      {selected.length > 0 && (
        <form className={`card ${styles.bulk}`} onSubmit={apply} aria-label="Change the selected images">
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-action`}>With the {selected.length} selected</label>
              <select id={`${id}-action`} value={action} onChange={(e) => setAction(e.target.value as Action)}>
                <option value="move">Move to a folder</option>
                <option value="rename">Rename as a series</option>
                <option value="credit">Set the photo credit</option>
                <option value="watermark_on">Add the watermark (© bottom-right)</option>
                <option value="watermark_off">Remove the watermark</option>
                <option value="ai_on">Add the &quot;AI-generated&quot; label</option>
                <option value="ai_off">Remove the &quot;AI-generated&quot; label</option>
              </select>
            </div>
            {action === "move" && (
              <div className="field">
                <label htmlFor={`${id}-folder`}>Folder</label>
                <input id={`${id}-folder`} list={`${id}-folders`} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Gins/Hernö" />
                <datalist id={`${id}-folders`}>
                  {folders.map((path) => (
                    <option key={path} value={path} />
                  ))}
                </datalist>
                <span className="field-hint">Pick one or type a new one; / makes a subfolder. Empty = no folder.</span>
              </div>
            )}
            {action === "rename" && (
              <div className="field">
                <label htmlFor={`${id}-name`}>New name</label>
                <input id={`${id}-name`} value={baseName} onChange={(e) => setBaseName(e.target.value)} required maxLength={150} placeholder="e.g. Hernö bottle" />
                <span className="field-hint">
                  {selected.length > 1
                    ? `Numbered in the order shown: "${baseName || "Name"} 1" to "${baseName || "Name"} ${selected.length}".`
                    : "The image gets exactly this name."}
                </span>
              </div>
            )}
            {action === "credit" && (
              <div className="field">
                <label htmlFor={`${id}-credit`}>Photo credit</label>
                <input id={`${id}-credit`} value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} placeholder="Empty clears it" />
              </div>
            )}
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Working…" : "Apply"}
            </button>
            <ConfirmButton
              label={`Delete ${selected.length}…`}
              title={`Delete ${selected.length} image${selected.length === 1 ? "" : "s"}?`}
              description="They disappear from the media library. Images still used by a gin, review, article or other page are kept and listed."
              confirmLabel="Delete"
              danger
              disabled={busy}
              onConfirm={() => run({ action: "delete" }, (n) => `${n} image${n === 1 ? "" : "s"} deleted.`)}
            />
            <button type="button" className="button button-secondary" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        </form>
      )}

      {skipped.length > 0 && (
        <div className="alert alert-warning" role="status">
          <strong>Not deleted, because they are still in use:</strong>
          <ul style={{ margin: 0 }}>
            {skipped.map((s) => (
              <li key={s.id}>
                {s.name ?? "Image"}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className={styles.grid}>
        {items.map((item) => {
          const label = item.name ?? item.original_filename ?? "Image";
          const isSelected = selected.includes(item.id);
          return (
            <li key={item.id} className={isSelected ? styles.tileSelected : styles.tile}>
              <input
                type="checkbox"
                className={styles.tick}
                checked={isSelected}
                onChange={() => toggle(item.id)}
                aria-label={`Select ${label}`}
              />
              <Link href={`/juniper/media/${item.id}`} className={styles.tileLink}>
                <MediaImage media={item} className={styles.thumb} sizes="240px" />
                <span className={styles.caption}>{label}</span>
                <span className={styles.used}>
                  {item.watermark && "© · "}
                  {item.ai_generated && "AI · "}
                  {item.alt ? "" : item.decorative ? "Decorative · " : "⚠ No alt text · "}
                  {item.used_by.length > 0 ? `Used in ${item.used_by.length}` : "Not used"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
