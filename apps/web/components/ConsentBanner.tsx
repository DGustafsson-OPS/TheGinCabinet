// The cookie banner: asks once (per policy version) which optional cookies may
// be used. Our own code: no third-party consent service.
//
// "Accept all" and "Reject all" are the same size and equally easy (EU rules:
// saying no must be as easy as saying yes). "Choose cookies" opens the
// per-category switches. The page stays usable meanwhile; optional cookies
// simply stay off until the visitor chooses.
import Link from "next/link";

import styles from "@/app/(public)/consent.module.css";

import ConsentForm from "./ConsentForm";
import ReturnPathInput from "./ReturnPathInput";

export default function ConsentBanner() {
  return (
    <section className={styles.banner} aria-labelledby="consent-title">
      <div className={styles.inner}>
        <div>
          <h2 id="consent-title" className={styles.title}>
            May we measure visits?
          </h2>
          <p className={styles.text}>
            With your permission we use Google Analytics to see which pages are read, so we can make the
            site better. It sets cookies and sends usage data to Google. Nothing is sold or used for
            advertising. <Link href="/cookie-settings">Cookie details</Link> ·{" "}
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>
        <form method="post" action="/consent" className={styles.actions}>
          <ReturnPathInput />
          <button className="button button-primary" type="submit" name="choice" value="accept_all">
            Accept all
          </button>
          <button className="button button-primary" type="submit" name="choice" value="reject_all">
            Reject all
          </button>
        </form>
        {/* <details>: a built-in, keyboard-friendly "show more"; works without JavaScript. */}
        <details className={styles.more}>
          <summary>Choose cookies</summary>
          <ConsentForm idPrefix="banner" analytics={false} />
        </details>
      </div>
    </section>
  );
}
