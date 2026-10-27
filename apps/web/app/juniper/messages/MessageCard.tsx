"use client";
// One contact-form message: read/unread, reply by email, delete (asks first).

import { useRouter } from "next/navigation";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { formatDateTime } from "@/lib/format";
import type { ContactMessage } from "@/lib/types";

export default function MessageCard({ message }: { message: ContactMessage }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const unread = message.read_at === null;

  async function mark(read: boolean) {
    try {
      await call(`/admin/messages/${message.id}`, "PATCH", { read });
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const reply = `mailto:${message.email}?subject=${encodeURIComponent("Re: your message to The Gin Cabinet")}`;
  return (
    <article className="card" aria-label={`Message from ${message.name}`} style={unread ? { borderLeft: "4px solid var(--color-brass)" } : undefined}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "space-between" }}>
        <strong>
          {message.name} <span className="field-hint">&lt;{message.email}&gt;</span>
          {unread && <span className="badge" style={{ marginLeft: "var(--space-2)" }}>New</span>}
        </strong>
        <time dateTime={message.created_at} className="field-hint">
          {formatDateTime(message.created_at)}
        </time>
      </header>
      <p style={{ whiteSpace: "pre-line" }}>{message.message}</p>
      <div className="form-actions">
        <a className="button button-primary" href={reply} onClick={() => unread && mark(true)}>
          Reply by email
        </a>
        <button type="button" className="button button-secondary" onClick={() => mark(unread)}>
          {unread ? "Mark as read" : "Mark as unread"}
        </button>
        <ConfirmButton
          label="Delete"
          title={`Delete the message from ${message.name}?`}
          description="It's deleted for good. This can't be undone."
          confirmLabel="Delete message"
          danger
          quiet
          onConfirm={async () => {
            try {
              await call(`/admin/messages/${message.id}`, "DELETE");
              toast("Message deleted.");
              router.refresh();
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
        />
      </div>
    </article>
  );
}
