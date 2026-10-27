"use client";
// A button that asks "Are you sure?" before doing something hard to undo
// (spec §2: "destructive action confirmation").
//
// The question appears inside the page (never as a browser popup). It uses
// the HTML <dialog> element, which handles focus and the Escape key for us,
// so keyboard and screen-reader users get it for free.

import { useId, useRef, useState } from "react";

import styles from "./ConfirmButton.module.css";

type Props = {
  /** The button's text. May include visually-hidden words for screen readers. */
  label: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  danger?: boolean;
  /** Keep the button grey (e.g. "Remove" beside "Move up"); the confirm button is still red. */
  quiet?: boolean;
  disabled?: boolean;
};

export default function ConfirmButton(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId(); // a unique, valid HTML id for aria-labelledby

  async function confirm() {
    setBusy(true);
    try {
      await props.onConfirm();
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`button ${props.danger && !props.quiet ? styles.danger : "button-secondary"}`}
        onClick={() => dialog.current?.showModal()}
        disabled={props.disabled}
      >
        {props.label}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.title}>
          {props.title}
        </h2>
        <p>{props.description}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => dialog.current?.close()}
            autoFocus // the safe choice gets focus first
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button ${props.danger || props.quiet ? styles.danger : "button-primary"}`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Working…" : props.confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
