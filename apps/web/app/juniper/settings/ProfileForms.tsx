"use client";
// Your own account (spec A10): name and email, password, moving sign-in codes
// to a new phone, and fresh recovery codes. Anything security-related asks
// for your current password first, so an unlocked laptop isn't enough.
//
// Several forms share this page, so every element id gets a useId() prefix
// to stay unique.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import type { Profile } from "@/lib/types";

/** Show an API error; "weak_password" lists each problem. */
function useErrors() {
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const show = (err: unknown) =>
    setError({
      message: errorMessage(err),
      items: err instanceof ApiError && Array.isArray(err.details) ? (err.details as string[]) : [],
    });
  const box = (
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
  );
  return { show, clear: () => setError(null), box };
}

/** Recovery codes, shown once. */
function CodeList({ codes }: { codes: string[] }) {
  return (
    <div className="alert alert-warning" role="status">
      <p style={{ marginTop: 0 }}>
        <strong>Your new recovery codes. They are shown only this once:</strong> save them in your password
        manager or print them. Each works once if you lose your phone. The old codes no longer work.
      </p>
      <ol style={{ fontFamily: "ui-monospace, monospace", columns: 2 }}>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
    </div>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const errors = useErrors();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== profile.email.toLowerCase();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    errors.clear();
    try {
      await call("/admin/profile", "PATCH", {
        display_name: displayName.trim(),
        ...(emailChanged && { email: email.trim(), current_password: password }),
      });
      toast("Profile saved.");
      setPassword("");
      router.refresh();
    } catch (err) {
      errors.show(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      {errors.box}
      <p className="field-hint">
        Signed in as <strong>{profile.username}</strong>. Your display name is the byline on reviews and
        articles; your email is never shown publicly.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-name`}>Display name</label>
          <input id={`${id}-name`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {emailChanged && (
          <div className="field">
            <label htmlFor={`${id}-password`}>Current password (needed to change your email)</label>
            <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { call, toast } = useAdmin();
  const id = useId();
  const errors = useErrors();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    errors.clear();
    if (next !== repeat) {
      errors.show(new Error("The new passwords don't match."));
      return;
    }
    setBusy(true);
    try {
      await call("/admin/profile/password", "POST", { current_password: current, new_password: next });
      toast("Password changed. Your other sessions were signed out.");
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      errors.show(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: "var(--font-size-h3)" }}>
        Change your password
      </h2>
      {errors.box}
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${id}-current`}>Current password</label>
          <input id={`${id}-current`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-new`}>New password</label>
          <input id={`${id}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} aria-describedby={`${id}-hint`} />
          <span id={`${id}-hint`} className="field-hint">
            At least 12 characters. A passphrase of a few unrelated words is easiest to remember.
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-repeat`}>New password again</label>
          <input id={`${id}-repeat`} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </div>
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

export function MfaChange({ pending }: { pending: boolean }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const id = useId();
  const errors = useErrors();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    errors.clear();
    try {
      setSetup(await call<{ secret: string; uri: string }>("/admin/profile/mfa/start", "POST", { current_password: password }));
      setPassword("");
    } catch (err) {
      errors.show(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    errors.clear();
    try {
      const result = await call<{ codes: string[] }>("/admin/profile/mfa/confirm", "POST", { code: code.trim() });
      setCodes(result.codes);
      setSetup(null);
      toast("Your new authenticator app is now active.");
      router.refresh();
    } catch (err) {
      errors.show(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: "var(--font-size-h3)" }}>
        Move sign-in codes to a new phone or app
      </h2>
      {errors.box}
      {codes && <CodeList codes={codes} />}
      {!setup ? (
        <form onSubmit={start}>
          <p className="field-hint">
            Your current app keeps working until the new one is confirmed.
            {pending && " (A change was started earlier but not finished; starting again replaces it.)"}
          </p>
          <div className="field">
            <label htmlFor={`${id}-password`}>Current password</label>
            <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="button button-secondary" type="submit" disabled={busy}>
            Start
          </button>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <ol>
            <li>
              In your authenticator app, add an account using this key: <code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
              <br />
              On the phone itself you can tap <a href={setup.uri}>this setup link</a> instead.
            </li>
            <li>Type the 6-digit code the app now shows for The Gin Cabinet.</li>
          </ol>
          <div className="field">
            <label htmlFor={`${id}-code`}>Code from the new app</label>
            <input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy}>
              Confirm new app
            </button>
            <ConfirmButton
              label="Cancel"
              title="Cancel moving to a new app?"
              description="The new app's setup is thrown away; remove its entry from that app too. Your current authenticator app keeps working."
              confirmLabel="Cancel the move"
              danger
              quiet
              onConfirm={async () => {
                await call("/admin/profile/mfa/start", "DELETE");
                setSetup(null);
              }}
            />
          </div>
        </form>
      )}
    </section>
  );
}

export function RecoveryCodes({ left }: { left: number }) {
  const router = useRouter();
  const { call } = useAdmin();
  const id = useId();
  const errors = useErrors();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function regenerate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    errors.clear();
    try {
      const result = await call<{ codes: string[] }>("/admin/profile/recovery-codes", "POST", { current_password: password });
      setCodes(result.codes);
      setPassword("");
      router.refresh();
    } catch (err) {
      errors.show(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: "var(--font-size-h3)" }}>
        Recovery codes
      </h2>
      <p>
        You have <strong>{left}</strong> unused recovery code{left === 1 ? "" : "s"}.
        {left <= 3 && " Make new ones soon."}
      </p>
      {errors.box}
      {codes && <CodeList codes={codes} />}
      <form onSubmit={regenerate}>
        <div className="field">
          <label htmlFor={`${id}-password`}>Current password</label>
          <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="button button-secondary" type="submit" disabled={busy}>
          Make new recovery codes
        </button>
      </form>
    </section>
  );
}
