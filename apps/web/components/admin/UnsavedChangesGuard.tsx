"use client";
// Asks "Leave without saving?" inside the page when someone clicks a link
// while a form has unsaved changes. (We don't use the browser's own
// "Leave site?" popup; for closing the tab or reloading, editors keep a local
// copy instead. See lib/local-copy.ts.)

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import styles from "./ConfirmButton.module.css";

type Props = {
  dirty: boolean;
  /** Called when the person chooses to leave, e.g. to delete a local copy. */
  onLeave?: () => void;
};

export default function UnsavedChangesGuard({ dirty, onLeave }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dirty) return;
    function onClick(event: MouseEvent) {
      // Leave new-tab clicks (Ctrl/Cmd/Shift/middle button) alone: nothing is lost.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Same page (e.g. a "#section" link): nothing is lost.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      setTarget(url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href);
      dialog.current?.showModal();
    }
    // "Capture" runs this before Next.js's own link handling.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function leave() {
    dialog.current?.close();
    if (!target) return;
    onLeave?.();
    if (target.startsWith("/")) router.push(target);
    else window.location.href = target;
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Leave without saving?
      </h2>
      <p>Your changes on this page haven&apos;t been saved. If you leave now, they are lost.</p>
      <div className={styles.actions}>
        <button type="button" className="button button-secondary" onClick={() => dialog.current?.close()} autoFocus>
          Stay on this page
        </button>
        <button type="button" className={`button ${styles.danger}`} onClick={leave}>
          Leave without saving
        </button>
      </div>
    </dialog>
  );
}
