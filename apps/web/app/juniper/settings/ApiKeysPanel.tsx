"use client";
// Settings → API keys: keys that let an AI assistant (or another program)
// use the admin. A key acts as you, but can't publish, and can't touch
// accounts, passwords, 2FA or keys. The new key is shown once only.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { formatDate } from "@/lib/format";
import type { ApiKey } from "@/lib/types";

const DURATIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

/** A read-only box with a Copy button, for the new key and the MCP addresses. */
function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <input id={id} value={value} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1, fontFamily: "monospace" }} />
        <button
          type="button"
          className="button button-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
          <span className="visually-hidden"> {label}</span>
        </button>
      </div>
    </div>
  );
}

export default function ApiKeysPanel({ keys }: { keys: ApiKey[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const [name, setName] = useState("Claude");
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(ApiKey & { key: string }) | null>(null);
  // This site's address. The part that uses it only shows after a click, so in the browser.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = await call<ApiKey & { key: string }>("/admin/api-keys", "POST", { name: name.trim(), days });
      setCreated(key);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <div>
        <p>
          An API key lets an AI assistant such as Claude add and update things for you: gins, distilleries, bottles,
          levels, recipes, articles and photos. It acts as you, with three limits:
        </p>
        <ul>
          <li>
            <strong>Nothing goes live by itself.</strong> What it creates stays private or a draft; you publish it.
          </li>
          <li>
            <strong>Accounts, passwords, 2FA and keys are off limits.</strong>
          </li>
          <li>
            <strong>Everything is logged.</strong> The audit log marks each change &quot;via API key&quot; with the
            key&apos;s name.
          </li>
        </ul>
      </div>

      {created ? (
        <section aria-labelledby={`${id}-new`} className="alert alert-warning" style={{ display: "grid", gap: "var(--space-3)" }}>
          <h2 id={`${id}-new`} style={{ fontSize: "var(--font-size-h3)", margin: 0 }}>
            Your new key &quot;{created.name}&quot;
          </h2>
          <p style={{ margin: 0 }}>
            <strong>Copy it now: it won&apos;t be shown again.</strong> Keep it like a password. Works until{" "}
            {formatDate(created.expires_at)}.
          </p>
          <CopyField label="API key" value={created.key} />
          <CopyField label="MCP address (key in the header)" value={`${origin}/api/v1/mcp`} />
          <CopyField label="MCP address with the key in it (for apps that only take an address)" value={`${origin}/api/v1/mcp/k/${created.key}`} />
          <button type="button" className="link-button" style={{ justifySelf: "start" }} onClick={() => setCreated(null)}>
            Done, I&apos;ve copied it
          </button>
        </section>
      ) : (
        <form onSubmit={create} aria-label="Create an API key">
          <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-name`}>Name</label>
              <input id={`${id}-name`} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
              <span className="field-hint">Shown in the audit log, e.g. &quot;Claude&quot;.</span>
            </div>
            <div className="field">
              <label htmlFor={`${id}-days`}>Works for</label>
              <select id={`${id}-days`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d.days} value={d.days}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create API key"}
            </button>
          </div>
        </form>
      )}

      <section aria-labelledby={`${id}-list`}>
        <h2 id={`${id}-list`} style={{ fontSize: "var(--font-size-h3)" }}>
          Keys
        </h2>
        {keys.length === 0 ? (
          <p className="empty-state">No API keys yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Key starts</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Works until</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} style={k.active ? undefined : { opacity: 0.6 }}>
                    <td>
                      {k.name}
                      <div className="field-hint">acts as {k.owner}</div>
                    </td>
                    <td>
                      <code>{k.prefix}…</code>
                    </td>
                    <td>{k.last_used_at ? formatDate(k.last_used_at) : "Never"}</td>
                    <td>{k.revoked_at ? `Revoked ${formatDate(k.revoked_at)}` : k.active ? formatDate(k.expires_at) : "Expired"}</td>
                    <td>
                      {k.active && (
                        <ConfirmButton
                          quiet
                          danger
                          label={<>Revoke<span className="visually-hidden"> {k.name}</span></>}
                          title={`Revoke the key "${k.name}"?`}
                          description="It stops working at once. Anything connected with it (such as Claude) loses access until you give it a new key."
                          confirmLabel="Revoke key"
                          onConfirm={async () => {
                            try {
                              await call(`/admin/api-keys/${k.id}`, "DELETE");
                              toast(`"${k.name}" revoked.`);
                              router.refresh();
                            } catch (err) {
                              toast(errorMessage(err), "error");
                            }
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
