"use client";
// Add, rename and delete message folders. Deleting a folder moves its
// messages back to the Inbox; nothing is lost.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import type { MessageBoxes } from "@/lib/types";

export default function FolderManager({ folders }: { folders: MessageBoxes["folders"] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
      router.refresh();
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{ marginTop: "var(--space-4)" }}>
      <summary className="link-button">Manage folders…</summary>
      <form
        aria-label="Add a folder"
        style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginTop: "var(--space-3)" }}
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await run(() => call("/admin/messages/folders", "POST", { name }), `Folder "${name.trim()}" added.`);
          if (ok) setName("");
        }}
      >
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="new-folder">New folder</label>
          <input id="new-folder" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. Ideas" />
        </div>
        <button type="submit" className="button button-secondary" disabled={busy}>
          Add
        </button>
      </form>
      {folders.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "var(--space-3)", display: "grid", gap: "var(--space-2)" }}>
          {folders.map((folder) => (
            <FolderRow key={folder.id} folder={folder} busy={busy} run={run} />
          ))}
        </ul>
      )}
    </details>
  );
}

type RowProps = {
  folder: MessageBoxes["folders"][number];
  busy: boolean;
  run: (action: () => Promise<unknown>, done: string) => Promise<boolean>;
};

/** One folder: its name, with Rename (edited in place) and Delete. */
function FolderRow({ folder, busy, run }: RowProps) {
  const { call } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const id = `rename-${folder.id}`;

  if (editing) {
    return (
      <li>
        <form
          aria-label={`Rename ${folder.name}`}
          style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => call(`/admin/messages/folders/${folder.id}`, "PATCH", { name }), "Folder renamed.")) {
              setEditing(false);
            }
          }}
        >
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor={id}>New name</label>
            <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          </div>
          <button type="submit" className="button button-secondary" disabled={busy}>
            Save
          </button>
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }
  return (
    <li style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1 }}>{folder.name}</span>
      <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(true)}>
        Rename<span className="visually-hidden"> {folder.name}</span>
      </button>
      <ConfirmButton
        quiet
        label={<>Delete<span className="visually-hidden"> {folder.name}</span></>}
        title={`Delete the folder "${folder.name}"?`}
        description={`Its ${folder.count} message${folder.count === 1 ? "" : "s"} go back to the Inbox. No messages are deleted.`}
        confirmLabel="Delete folder"
        danger
        onConfirm={async () => {
          await run(() => call(`/admin/messages/folders/${folder.id}`, "DELETE"), "Folder deleted.");
        }}
      />
    </li>
  );
}
