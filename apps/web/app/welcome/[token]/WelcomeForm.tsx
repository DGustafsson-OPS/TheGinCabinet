"use client";
// The three steps of accepting an invitation:
//   1. choose a password (the API checks its rules before giving a key)
//   2. add the account to an authenticator app and type its 6-digit code
//   3. save the recovery codes, shown once
// Nothing is saved until step 2 succeeds: password and code together.

import Link from "next/link";
import { useId, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

type Setup = { secret: string; uri: string };

export default function WelcomeForm({ token, username }: { token: string; username: string }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/auth/invite/${encodeURIComponent(token)}`;

  function show(err: unknown) {
    setError({
      message: err instanceof Error ? err.message : "Something went wrong.",
      items: err instanceof ApiError && Array.isArray(err.details) ? (err.details as string[]) : [],
    });
  }

  async function toCodes(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError({ message: "The two passwords don't match.", items: [] });
      return;
    }
    setBusy(true);
    try {
      setSetup(await apiFetch<Setup>(`${base}/mfa`, { method: "POST", body: { password } }));
    } catch (err) {
      show(err);
    } finally {
      setBusy(false);
    }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ codes: string[] }>(`${base}/complete`, {
        method: "POST",
        body: { password, code: code.trim() },
      });
      setCodes(result.codes);
      setPassword("");
      setRepeat("");
    } catch (err) {
      show(err);
    } finally {
      setBusy(false);
    }
  }

  const errorBox = (
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

  if (codes) {
    return (
      <div>
        <h2 style={{ fontSize: "var(--font-size-h3)" }}>Your account is ready</h2>
        <div className="alert alert-warning" role="status">
          <p style={{ marginTop: 0 }}>
            <strong>Your recovery codes, shown only this once.</strong> Save them in your password manager. Each works
            once if you lose your phone.
          </p>
          <ol style={{ fontFamily: "ui-monospace, monospace", columns: 2 }}>
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </div>
        <p>
          Then <Link href="/login">sign in</Link> as <strong>{username}</strong>. (Wait for the next code in your app:
          the one you just typed can&apos;t be used twice.)
        </p>
      </div>
    );
  }

  if (setup) {
    return (
      <form onSubmit={finish} aria-label="Step 2: sign-in codes">
        {errorBox}
        <ol>
          <li>
            In an authenticator app (1Password, Google Authenticator, Authy…), add an account with this key:{" "}
            <code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
            <br />
            On your phone you can tap <a href={setup.uri}>this setup link</a> instead.
          </li>
          <li>Type the 6-digit code the app shows for The Gin Cabinet.</li>
        </ol>
        <div className="field">
          <label htmlFor={`${id}-code`}>Code from the app</label>
          <input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Finish setting up"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={toCodes} aria-label="Step 1: your password">
      {errorBox}
      <div className="field">
        <label htmlFor={`${id}-password`}>Choose a password</label>
        <input id={`${id}-password`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} aria-describedby={`${id}-hint`} />
        <span id={`${id}-hint`} className="field-hint">
          At least 12 characters. A few unrelated words make a strong, memorable passphrase.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-repeat`}>Repeat the password</label>
        <input id={`${id}-repeat`} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>
        Next: sign-in codes
      </button>
    </form>
  );
}
