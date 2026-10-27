// Shown when a visitor answers "No" at the age gate. It lives outside the
// public layout, so no site content (and no gate) appears here.
import { connection } from "next/server";
import type { Metadata } from "next";

import { MINIMUM_AGE } from "@/lib/age-gate";

import styles from "../(public)/age-gate.module.css";

export const metadata: Metadata = { title: "Age restricted", robots: { index: false } };

export default async function AgeRestrictedPage() {
  // Render per request, not once at build time, so Next.js can put this
  // request's script nonce on the page (see lib/csp.ts).
  await connection();
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
          Questions about alcohol? <a href="https://paihdelinkki.fi">Päihdelinkki</a> offers free,
          anonymous information and support.
        </p>
      </div>
    </main>
  );
}
