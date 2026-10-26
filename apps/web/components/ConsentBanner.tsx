// The cookie banner: asks once whether Google Analytics may run.
//
// "Accept" and "Reject" are the same size and equally easy (EU rules: saying
// no must be as easy as saying yes). It doesn't block the page; until the
// visitor chooses, analytics simply stays off.
import Link from "next/link";

import styles from "@/app/(public)/consent.module.css";

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
            advertising. <Link href="/privacy">Privacy details</Link>
          </p>
        </div>
        <form method="post" action="/consent" className={styles.actions}>
          <ReturnPathInput />
          <button className="button button-primary" type="submit" name="choice" value="accept">
            Accept analytics
          </button>
          <button className="button button-primary" type="submit" name="choice" value="reject">
            Reject
          </button>
        </form>
      </div>
    </section>
  );
}
