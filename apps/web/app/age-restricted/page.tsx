// Shown when a visitor answers "No" at the age gate. It lives outside the
// public layout, so no site content (and no gate) appears here.
import type { Metadata } from "next";

import { MINIMUM_AGE } from "@/lib/age-gate";

import styles from "../(public)/age-gate.module.css";

export const metadata: Metadata = { title: "Age restricted", robots: { index: false } };

export default function AgeRestrictedPage() {
  return (
    <main id="main" className={styles.restricted}>
      <div className={styles.panel}>
        <p className={styles.brand}>The Gin Cabinet</p>
        <h1 className={styles.title}>Sorry, this site is for adults</h1>
        <p>
          The Gin Cabinet is about alcohol, so you need to be at least {MINIMUM_AGE} years old to visit.
          You&apos;re welcome back when you are.
        </p>
        <p className={styles.small}>
          Questions about alcohol? <a href="https://www.alkoholhjalpen.se">Alkoholhjälpen</a> offers free,
          anonymous advice.
        </p>
      </div>
    </main>
  );
}
