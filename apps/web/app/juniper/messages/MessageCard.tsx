"use client";
// One contact-form message: read/unread, reply by email, move to a folder,
// mark as spam (or back), notes, and delete (asks first).

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { formatDateTime } from "@/lib/format";
import type { ContactMessage, MessageFolderRef } from "@/lib/types";

import styles from "./messages.module.css";

type Props = { message: ContactMessage; folders: MessageFolderRef[] };

export default function MessageCard({ message, folders }: Props) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unread = message.read_at === null;
  const isSpam = message.spam_at !== null;

  async function send(path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown, done?: string) {
    setBusy(true);
    try {
      await call(path, method, body);
      if (done) toast(done);
      router.refresh();
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const update = (body: unknown, done?: string) => send(`/admin/messages/${message.id}`, "PATCH", body, done);

  const reply = `mailto:${message.email}?subject=${encodeURIComponent("Re: your message to The Gin Cabinet")}`;
  return (
    <article className="card" aria-label={`Message from ${message.name}`} style={unread ? { borderLeft: "4px solid var(--color-brass)" } : undefined}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "space-between" }}>
        <strong>
          {message.name} <span className="field-hint">&lt;{message.email}&gt;</span>
          {unread && <span className="badge" style={{ marginLeft: "var(--space-2)" }}>New</span>}
          {isSpam && <span className="badge badge-private" style={{ marginLeft: "var(--space-2)" }}>Spam</span>}
        </strong>
        <time dateTime={message.created_at} className="field-hint">
          {formatDateTime(message.created_at)}
        </time>
      </header>
      <p style={{ whiteSpace: "pre-line" }}>{message.message}</p>

      <div className="form-actions" style={{ alignItems: "flex-end" }}>
        {!isSpam && (
          <a className="button button-primary" href={reply} onClick={() => unread && update({ read: true })}>
            Reply by email
          </a>
        )}
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => update({ read: unread })}>
          {unread ? "Mark as read" : "Mark as unread"}
        </button>
        {!isSpam && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor={`${id}-folder`}>Move to</label>
            <select
              id={`${id}-folder`}
              value={message.folder?.id ?? ""}
              disabled={busy}
              onChange={(e) => {
                const target = folders.find((f) => f.id === e.target.value);
                update({ folder_id: target?.id ?? null }, `Moved to ${target?.name ?? "the Inbox"}.`);
              }}
            >
              <option value="">Inbox</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {isSpam ? (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => update({ spam: false }, "Not spam: moved back.")}>
            Not spam
          </button>
        ) : (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => update({ spam: true }, "Marked as spam. It's deleted in 90 days.")}>
            Mark as spam
          </button>
        )}
        <ConfirmButton
          label="Delete"
          title={`Delete the message from ${message.name}?`}
          description="It's deleted for good, with its notes. This can't be undone."
          confirmLabel="Delete message"
          danger
          quiet
          onConfirm={async () => {
            await send(`/admin/messages/${message.id}`, "DELETE", undefined, "Message deleted.");
          }}
        />
      </div>

      <section className={styles.notes} aria-label={`Notes on the message from ${message.name}`}>
        {message.notes.length > 0 && (
          <ol>
            {message.notes.map((n) => (
              <li key={n.id} className={styles.note}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <span className="field-hint">
                    {n.author_name ?? "Someone"} · <time dateTime={n.created_at}>{formatDateTime(n.created_at)}</time>
                  </span>
                  <ConfirmButton
                    quiet
                    label={<>Delete note<span className="visually-hidden"> by {n.author_name}</span></>}
                    title="Delete this note?"
                    description="The note is deleted for good. The message stays."
                    confirmLabel="Delete note"
                    danger
                    onConfirm={async () => {
                      await send(`/admin/messages/${message.id}/notes/${n.id}`, "DELETE", undefined, "Note deleted.");
                    }}
                  />
                </div>
                <p className={styles.noteText}>{n.text}</p>
              </li>
            ))}
          </ol>
        )}
        <form
          aria-label={`Add a note to the message from ${message.name}`}
          onSubmit={async (event) => {
            event.preventDefault();
            if (await send(`/admin/messages/${message.id}/notes`, "POST", { text: note }, "Note added.")) setNote("");
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-note`}>Add a note</label>
            <textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={10000}
              rows={3}
              placeholder="e.g. a copy of the reply you sent, or what to do next"
            />
          </div>
          <button type="submit" className="button button-secondary" disabled={busy || !note.trim()}>
            Add note
          </button>
        </form>
      </section>
    </article>
  );
}
