// The "Are you 18 or older?" gate shown over every public page until the
// visitor confirms (see app/(public)/layout.tsx).
//
// It's a plain HTML form that posts to /age-check, so it works even without
// JavaScript. The page behind it is made `inert`: it can't be clicked, focused
// or read by screen readers, so the gate is the only thing to interact with.
import { MINIMUM_AGE } from "@/lib/age-gate";

import styles from "@/app/(public)/age-gate.module.css";

import ReturnPathInput from "./ReturnPathInput";

export default function AgeGate() {
  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="age-gate-title" aria-describedby="age-gate-text" className={styles.panel}>
        <p className={styles.brand}>The Gin Cabinet</p>
        <h2 id="age-gate-title" className={styles.title}>
          Are you {MINIMUM_AGE} or older?
        </h2>
        <p id="age-gate-text">
          This site is about gin and cocktails. Please confirm that you are at least {MINIMUM_AGE} years old
          to continue.
        </p>
        <form method="post" action="/age-check" className={styles.actions}>
          <ReturnPathInput />
          {/* autoFocus: keyboard and screen-reader users start right here. */}
          <button className="button button-primary" type="submit" name="answer" value="yes" autoFocus>
            Yes, I&apos;m {MINIMUM_AGE} or older
          </button>
          <button className={`button ${styles.secondary}`} type="submit" name="answer" value="no">
            No
          </button>
        </form>
        <p className={styles.small}>
          We remember your answer for 30 days with a small cookie. Please enjoy responsibly.
        </p>
      </div>
    </div>
  );
}
