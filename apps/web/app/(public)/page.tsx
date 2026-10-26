// P01 Home (spec §4). Phase 1 shell: the cinematic hero and the two calls to
// action. Latest reviews, featured cocktails and public metrics arrive with the
// public API in Phase 5.
import Link from "next/link";

import styles from "./public.module.css";

export default function HomePage() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>A shared collection</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            The Gin Cabinet
          </h1>
          <p className={styles.heroText}>
            Tasting notes, honest reviews and cocktails from a cabinet of gins collected by two
            friends.
          </p>
          <div className={styles.actions}>
            <Link className="button button-primary" href="/collection">
              Explore gins
            </Link>
            <Link className="button button-secondary" href="/cocktails">
              View cocktails
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="soon-title">
        <h2 id="soon-title">The cabinet is being stocked</h2>
        <p>
          The public collection, reviews and cocktail library open soon. Every bottle here is
          catalogued and tasted before it appears on the site.
        </p>
      </section>
    </>
  );
}
