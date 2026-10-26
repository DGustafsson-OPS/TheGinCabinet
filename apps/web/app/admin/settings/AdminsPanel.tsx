"use client";
// The two admin accounts (spec A10). There are no public sign-ups: accounts are
// created on the server with `python -m app.cli create-admin`.
//
// Resetting the *other* admin's password is deliberate, never silent: you
// type your own password and their username, they are signed out everywhere,
// the audit log records it, and they see a notice on their Settings page.

import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { AdminAccount } from "@/lib/types";

function ResetForm({ admin }: { admin: AdminAccount }) {
  const { call, toast } = useAdmin();
  const id = useId();
  const [current, setCurrent] = useState("");
  const [confirm, setConfirm] = useState("");
  const [temporary, setTemporary] = useState("");
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/admins/${admin.id}/reset-password`, "POST", {
        current_password: current,
        confirm_username: confirm,
        new_password: temporary,
      });
      toast(`${admin.display_name}'s password was reset. Give them the temporary password in person.`);
      setCurrent("");
      setConfirm("");
      setTemporary("");
    } catch (err) {
      setError({
        message: errorMessage(err),
        items: err instanceof ApiError && Array.isArray(err.details) ? (err.details as string[]) : [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    // <details>: a built-in, keyboard-friendly "show more"; the form stays hidden until opened.
    <details>
      <summary>Reset {admin.display_name}&apos;s password…</summary>
      <form onSubmit={submit} style={{ marginTop: "var(--space-3)" }}>
        <p className="field-hint">
          Only when {admin.display_name} is locked out. They will be signed out everywhere, see a notice next
          time they sign in, and this is recorded in the audit log. Their authenticator app is not changed.
        </p>
        <div role="alert">
          {error && (
            <div className="alert alert-error">
              <p style={{ margin: 0 }}>{error.message}</p>
              {error.items.length > 0 && (
                <ul style={{ margin: 0 }}>
                  {error.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-current`}>Your current password</label>
            <input id={`${id}-current`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor={`${id}-confirm`}>Type their username ({admin.username}) to confirm</label>
            <input id={`${id}-confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="off" />
          </div>
          <div className="field span-2">
            <label htmlFor={`${id}-temporary`}>Temporary password for {admin.display_name}</label>
            <input id={`${id}-temporary`} type="password" autoComplete="new-password" value={temporary} onChange={(e) => setTemporary(e.target.value)} required minLength={12} />
            <span className="field-hint">They should change it on their own Settings page right away.</span>
          </div>
        </div>
        <button className="button button-danger" type="submit" disabled={busy || confirm.trim().toLowerCase() !== admin.username}>
          {busy ? "Resetting…" : `Reset ${admin.display_name}'s password`}
        </button>
      </form>
    </details>
  );
}

export default function AdminsPanel({ admins }: { admins: AdminAccount[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <p className="field-hint">
        The Gin Cabinet has two administrators with equal rights. New accounts can only be created on the server.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Email</th>
              <th scope="col">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.display_name}
                  {a.is_you && " (you)"}
                  {!a.enabled && " · disabled"}
                </td>
                <td>{a.username}</td>
                <td>{a.email}</td>
                <td>{a.last_login_at ? formatDateTime(a.last_login_at) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admins
        .filter((a) => !a.is_you)
        .map((a) => (
          <ResetForm key={a.id} admin={a} />
        ))}
    </div>
  );
}
