"use client";
// The contact form, with Cloudflare Turnstile's "are you human?" check.
//
// Turnstile is drawn by Cloudflare's script into the box below; when it's
// satisfied it hands us a one-time token, which goes to our API with the
// message. The API asks Cloudflare whether the token is genuine before
// saving anything (apps/api/app/services/turnstile.py).

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

// The small part of Cloudflare's browser API we use.
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const MESSAGES: Record<string, string> = {
  turnstile_failed: "We couldn't confirm you're not a robot. Please tick the check again.",
  too_many_messages: "You've sent several messages already. Please try again in an hour.",
};

export default function ContactForm({ siteKey, nonce }: { siteKey: string; nonce?: string }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [values, setValues] = useState({ name: "", email: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Draw the check box once Cloudflare's script is there (also when arriving
  // by a link inside the site, when the script is already loaded).
  const draw = useCallback(() => {
    if (!window.turnstile || !box.current || widget.current) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      theme: "light",
      callback: (value: string) => setToken(value),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
  }, [siteKey]);

  useEffect(() => {
    draw();
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [draw]);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Please complete the check above the Send button first.");
      return;
    }
    setState("sending");
    try {
      await apiFetch("/public/contact", { method: "POST", body: { ...values, turnstile_token: token } });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? (MESSAGES[err.code] ?? err.message) : "Something went wrong.");
      // A token works once: get a fresh one for the next try.
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      setToken("");
    }
  }

  if (state === "sent") {
    return (
      <p className="alert alert-info" role="status">
        <strong>Thank you, your message is on its way.</strong> We&apos;ll reply to {values.email} as soon as we can.
      </p>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce} onReady={draw} />
      <form onSubmit={submit} aria-label="Contact form" style={{ marginTop: "var(--space-5)" }}>
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
        <div className="field">
          <label htmlFor={`${id}-name`}>Your name</label>
          <input id={`${id}-name`} value={values.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Your email</label>
          <input id={`${id}-email`} type="email" value={values.email} onChange={set("email")} required maxLength={254} autoComplete="email" />
          <span className="field-hint">So we can reply. Never shown on the site.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-message`}>Message</label>
          <textarea id={`${id}-message`} value={values.message} onChange={set("message")} required minLength={5} maxLength={5000} rows={7} />
        </div>
        {/* A trap for bots: hidden from people (and screen readers), so only bots fill it in. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor={`${id}-website`}>Leave this empty</label>
          <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </div>
        <div ref={box} className="turnstile-box" />
        <button className="button button-primary" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send message"}
        </button>
      </form>
    </>
  );
}
