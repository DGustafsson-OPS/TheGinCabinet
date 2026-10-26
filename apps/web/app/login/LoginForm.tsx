"use client";
// The two-step sign-in form. It runs in the browser because it reacts to typing
// and submitting. The flow matches the API (see apps/api/README.md §4):
//   1. username + password  →  POST /api/v1/auth/login
//   2. 6-digit code         →  POST /api/v1/auth/mfa/verify

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

type Step = "password" | "mfa";

// Friendly wording for the API's stable error codes.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That username and password don't match.",
  invalid_mfa_code: "That code isn't valid. Check your authenticator app and try again.",
  too_many_attempts: "Too many attempts. Please wait 15 minutes and try again.",
  network_error: "Could not reach the server. Check your connection.",
};

export default function LoginForm({ initialStep }: { initialStep: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  // When the MFA step appears, put the cursor in the code box.
  useEffect(() => {
    if (step === "mfa") codeInput.current?.focus();
  }, [step, useRecovery]);

  function showError(err: unknown) {
    if (err instanceof ApiError && err.code === "mfa_not_pending") {
      // The 5-minute window for the code ran out: start again.
      setStep("password");
      setError("Your sign-in timed out. Please enter your password again.");
      return;
    }
    const code = err instanceof ApiError ? err.code : "network_error";
    setError(MESSAGES[code] ?? (err as Error).message);
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); // stop the browser's own full-page form submit
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: { username: form.get("username"), password: form.get("password") },
      });
      setStep("mfa");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/mfa/verify", { method: "POST", body: { code: form.get("code") } });
      router.replace("/admin");
      router.refresh(); // re-run server components so they see the new session
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  return (
    <>
      {/* role="alert" makes screen readers announce errors as they appear. */}
      <div role="alert" aria-live="assertive">
        {error && <p className="alert alert-error">{error}</p>}
      </div>

      {/* Different `key`s make React build a fresh form for each step. Without
          them React reuses the same <input> element, and the username typed in
          step 1 would still be sitting in the code box in step 2. */}
      {step === "password" ? (
        <form key="password-step" onSubmit={submitPassword}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" autoComplete="username" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form key="code-step" onSubmit={submitCode}>
          <div className="field">
            <label htmlFor="code">{useRecovery ? "Recovery code" : "Authentication code"}</label>
            <input
              ref={codeInput}
              id="code"
              name="code"
              required
              autoComplete="one-time-code"
              inputMode={useRecovery ? "text" : "numeric"}
              pattern={useRecovery ? undefined : "[0-9 ]{6,7}"}
              aria-describedby="code-hint"
            />
            <span id="code-hint" className="field-hint">
              {useRecovery
                ? "One of the codes you saved when your account was created, like a1b2c-3d4e5."
                : "The 6-digit code from your authenticator app."}
            </span>
          </div>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Sign in"}
          </button>
          <p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setError(null);
              }}
            >
              {useRecovery ? "Use the authenticator app" : "Lost your phone? Use a recovery code"}
            </button>
          </p>
        </form>
      )}
    </>
  );
}
