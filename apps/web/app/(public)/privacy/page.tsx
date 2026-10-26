// P09 Privacy (spec §4, §9 "Privacy notices"). Plain-language, and true to
// what the code actually does: no analytics, no tracking, no visitor accounts.
import type { Metadata } from "next";

import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What The Gin Cabinet stores about visitors (almost nothing) and why.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className={styles.prose}>
      <h1>Privacy</h1>
      <p className={styles.lead}>Short version: we don&apos;t track you.</p>

      <h2>Visitors</h2>
      <ul>
        <li>There are no visitor accounts, comments or newsletters.</li>
        <li>We don&apos;t use analytics, advertising or third-party tracking scripts.</li>
        <li>We don&apos;t set cookies for visitors, so there is no cookie banner.</li>
        <li>
          Like every website, our server briefly logs technical details of requests (such as IP
          address and time) to keep the site secure and working. These logs are not used to
          profile anyone.
        </li>
      </ul>

      <h2>The two editors</h2>
      <p>
        Only the two people who run the site can sign in. Their sign-in uses a strictly necessary
        session cookie, and their actions are recorded in an internal audit log.
      </p>

      <h2>Photos</h2>
      <p>
        Location data and other hidden details are removed from every photo before it is
        published.
      </p>

      <h2>Questions</h2>
      <p>If you have a question about your data, use the contact details on the About page.</p>
    </article>
  );
}
