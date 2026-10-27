"use client";
// People (spec A10, extended): everyone who can sign in, and what admins can
// do about them. There are no public sign-ups.
//
// * **Invite**: creates the account and a one-time link (valid 7 days). The
//   person opens it, chooses their own password and sets up their own
//   authenticator app, so no password or code is ever handed over.
// * **Edit**: someone else's display name (no password needed), email, role
//   or access (your password needed). They're told on their Settings page.
// * **Reset password**: only when someone is locked out; deliberate and audited.
//
// Accounts in use are never deleted (their name stays on what they wrote);
// switch their access off instead. Unused invitations can be cancelled.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { AdminAccount, InviteOut, Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", editor: "Editor" };
const ROLE_HINT =
  "Admins can do everything. Editors write and publish content (Journal, reviews, tastings, cocktails, tonics, photos, page texts) but can't see inventory, prices, settings, messages or accounts.";

/** An API error, listing each problem when there are several. */
function ErrorBox({ error }: { error: unknown }) {
  if (!error) return <div role="alert" />;
  const items = error instanceof ApiError && Array.isArray(error.details) ? (error.details as string[]) : [];
  return (
    <div role="alert">
      <div className="alert alert-error">
        <p style={{ margin: 0 }}>{errorMessage(error)}</p>
        {items.length > 0 && (
          <ul style={{ margin: 0 }}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The one-time invitation link, shown right after it's made. */
function InviteLink({ invite }: { invite: InviteOut }) {
  const url = `${window.location.origin}${invite.invite_path}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="alert alert-warning" role="status">
      <p style={{ marginTop: 0 }}>
        <strong>Invitation link for {invite.account.display_name}.</strong> It&apos;s shown only now and works
        once, until {formatDateTime(invite.expires_at)}. Send it to them privately (not in a public chat).
      </p>
      <p style={{ wordBreak: "break-all", fontFamily: "ui-monospace, monospace" }}>{url}</p>
      <button
        type="button"
        className="button button-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: (invite: InviteOut) => void }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [values, setValues] = useState({ display_name: "", username: "", email: "", role: "editor" as Role });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invite = await call<InviteOut>("/admin/admins", "POST", values);
      onInvited(invite);
      toast(`${invite.account.display_name} is invited. Send them the link.`);
      setValues({ display_name: "", username: "", email: "", role: "editor" });
      router.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>Invite someone…</summary>
      <form onSubmit={submit} style={{ marginTop: "var(--space-3)" }} aria-label="Invite someone">
        <ErrorBox error={error} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-name`}>Display name</label>
            <input id={`${id}-name`} value={values.display_name} onChange={set("display_name")} required maxLength={120} />
            <span className="field-hint">Shown as the byline on what they write.</span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-username`}>Username</label>
            <input id={`${id}-username`} value={values.username} onChange={set("username")} required minLength={3} maxLength={64} pattern="[A-Za-z0-9._\-]+" autoComplete="off" />
            <span className="field-hint">For signing in. Letters, digits, dots, dashes.</span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input id={`${id}-email`} type="email" value={values.email} onChange={set("email")} required />
          </div>
          <div className="field">
            <label htmlFor={`${id}-role`}>Role</label>
            <select id={`${id}-role`} value={values.role} onChange={set("role")}>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <p className="field-hint span-2">{ROLE_HINT}</p>
        </div>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Inviting…" : "Create invitation link"}
        </button>
      </form>
    </details>
  );
}

function EditForm({ account }: { account: AdminAccount }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [values, setValues] = useState({
    display_name: account.display_name,
    email: account.email,
    role: account.role,
    enabled: account.enabled,
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const sensitive =
    values.email.trim().toLowerCase() !== account.email.toLowerCase() ||
    values.role !== account.role ||
    values.enabled !== account.enabled;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/admins/${account.id}`, "PATCH", {
        display_name: values.display_name.trim(),
        email: values.email.trim(),
        role: values.role,
        enabled: values.enabled,
        ...(sensitive && { current_password: password }),
      });
      toast(`${values.display_name.trim()}'s account was saved. They'll see a note about it.`);
      setPassword("");
      router.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={`Edit ${account.display_name}`} style={{ marginTop: "var(--space-3)" }}>
      <ErrorBox error={error} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-name`}>Display name</label>
          <input id={`${id}-name`} value={values.display_name} onChange={(e) => setValues((v) => ({ ...v, display_name: e.target.value }))} required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-role`}>Role</label>
          <select id={`${id}-role`} value={values.role} onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as Role }))}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field-checkbox">
          <input id={`${id}-enabled`} type="checkbox" checked={values.enabled} onChange={(e) => setValues((v) => ({ ...v, enabled: e.target.checked }))} />
          <label htmlFor={`${id}-enabled`}>Can sign in</label>
        </div>
        {sensitive && (
          <div className="field span-2">
            <label htmlFor={`${id}-password`}>Your current password</label>
            <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <span className="field-hint">
              Needed to change someone&apos;s email, role or access.
              {(values.role !== account.role || !values.enabled) && " They'll be signed out everywhere."}
            </span>
          </div>
        )}
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function ResetForm({ admin }: { admin: AdminAccount }) {
  const { call, toast } = useAdmin();
  const id = useId();
  const [current, setCurrent] = useState("");
  const [confirm, setConfirm] = useState("");
  const [temporary, setTemporary] = useState("");
  const [error, setError] = useState<unknown>(null);
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
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "var(--space-4)" }} aria-label={`Reset ${admin.display_name}'s password`}>
      <h4 style={{ margin: "0 0 var(--space-2)" }}>Reset password</h4>
      <p className="field-hint">
        Only when {admin.display_name} is locked out. They will be signed out everywhere, see a notice next time
        they sign in, and this is recorded in the audit log. Their authenticator app is not changed.
      </p>
      <ErrorBox error={error} />
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
  );
}

/** Someone invited who hasn't finished setting up: new link, or cancel. */
function PendingActions({ account, onInvited }: { account: AdminAccount; onInvited: (invite: InviteOut) => void }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const expired = account.invite_expires_at !== null && new Date(account.invite_expires_at) < new Date();
  return (
    <div className="form-actions" style={{ marginTop: "var(--space-3)" }}>
      <p className="field-hint" style={{ width: "100%", margin: 0 }}>
        Invited; hasn&apos;t set up their account yet.{" "}
        {account.invite_expires_at &&
          (expired ? "The link has expired." : `The link works until ${formatDateTime(account.invite_expires_at)}.`)}
      </p>
      <ConfirmButton
        label="New invitation link"
        title={`Make a new link for ${account.display_name}?`}
        description="The old link stops working. You'll see the new one once, to send to them."
        confirmLabel="Make new link"
        onConfirm={async () => {
          try {
            onInvited(await call<InviteOut>(`/admin/admins/${account.id}/invite`, "POST"));
            router.refresh();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
      <ConfirmButton
        label="Cancel invitation"
        title={`Cancel ${account.display_name}'s invitation?`}
        description="The account and its link are deleted. You can invite them again later."
        confirmLabel="Cancel invitation"
        danger
        onConfirm={async () => {
          try {
            await call(`/admin/admins/${account.id}`, "DELETE");
            toast("Invitation cancelled.");
            router.refresh();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
    </div>
  );
}

export default function AdminsPanel({ admins }: { admins: AdminAccount[] }) {
  const [invite, setInvite] = useState<InviteOut | null>(null);
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <p className="field-hint">{ROLE_HINT} At most two admins and ten accounts in total.</p>
      {invite && <InviteLink invite={invite} />}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
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
                  {!a.enabled && " · can't sign in"}
                  {a.invite_pending && " · invited"}
                </td>
                <td>{ROLE_LABELS[a.role]}</td>
                <td>{a.username}</td>
                <td>{a.email}</td>
                <td>{a.last_login_at ? formatDateTime(a.last_login_at) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InviteForm onInvited={setInvite} />
      {admins
        .filter((a) => !a.is_you)
        .map((a) => (
          // <details>: a built-in, keyboard-friendly "show more".
          <details key={a.id}>
            <summary>Manage {a.display_name}…</summary>
            {a.invite_pending ? (
              <PendingActions account={a} onInvited={setInvite} />
            ) : (
              <>
                <EditForm key={`${a.display_name}|${a.email}|${a.role}|${a.enabled}`} account={a} />
                <ResetForm admin={a} />
              </>
            )}
          </details>
        ))}
    </div>
  );
}
