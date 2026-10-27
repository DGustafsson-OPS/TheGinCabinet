"use client";
// Rename or move the folder being viewed. Its subfolders move with it.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { MediaBulkResult } from "@/lib/types";

export default function FolderActions({ folder }: { folder: string }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [to, setTo] = useState(folder);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename() {
    setBusy(true);
    setError(null);
    try {
      const result = await call<MediaBulkResult>("/admin/media/folders/rename", "POST", { from_path: folder, to_path: to });
      toast(`Folder renamed; ${result.changed} image${result.changed === 1 ? "" : "s"} moved.`);
      const target = to.trim();
      router.push(target ? `/juniper/media?folder=${encodeURIComponent(target)}` : "/juniper/media?folder=%2F");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary className="link-button">Rename or move this folder…</summary>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="field" style={{ marginTop: "var(--space-2)" }}>
        <label htmlFor={`${id}-to`}>New folder path</label>
        <input id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} maxLength={300} aria-describedby={`${id}-hint`} />
        <span id={`${id}-hint`} className="field-hint">
          e.g. &quot;Bottles/Gin&quot; to move it into Bottles. Subfolders move with it. Empty = take its images out of
          folders.
        </span>
      </div>
      <button type="button" className="button button-secondary" onClick={rename} disabled={busy || to.trim() === folder}>
        {busy ? "Working…" : "Rename folder"}
      </button>
    </details>
  );
}
