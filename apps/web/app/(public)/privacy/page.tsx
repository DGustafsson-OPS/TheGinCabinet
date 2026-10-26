// P09 Privacy (spec §4, §9 "Privacy notices"). Plain-language, and true to
// what the code actually does. The analytics section appears only when
// Google Analytics is switched on (GA_MEASUREMENT_ID is set).
import type { Metadata } from "next";

import { gaMeasurementId } from "@/lib/consent";

import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What The Gin Cabinet stores about visitors (almost nothing) and why.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const analytics = Boolean(gaMeasurementId());
  return (
    <article className={styles.prose}>
      <h1>Privacy</h1>
      <p className={styles.lead}>
        {analytics
          ? "Short version: we only measure visits if you allow it, and never for advertising."
          : "Short version: we don't track you."}
      </p>

      <h2>Visitors</h2>
      <ul>
        <li>There are no visitor accounts, comments or newsletters.</li>
        {!analytics && <li>We don&apos;t use analytics, advertising or third-party tracking scripts.</li>}
        <li>
          We set one small cookie, <code>gc_age_ok</code>, when you confirm you are old enough to visit.
          It contains only the value &quot;1&quot;, is never used for tracking, and expires after 30 days.
          {!analytics && " There are no tracking or advertising cookies, so there is no cookie banner."}
        </li>
        <li>
          Like every website, our server briefly logs technical details of requests (such as IP
          address and time) to keep the site secure and working. These logs are not used to
          profile anyone.
        </li>
      </ul>

      {analytics && (
        <>
          <h2>Analytics (only with your permission)</h2>
          <p>
            If you choose <strong>Accept analytics</strong> in the cookie banner, we use Google Analytics 4
            to understand which pages are visited, roughly where visitors come from (country, city) and
            which device and browser they use. Nothing is loaded from Google until you accept.
          </p>
          <ul>
            <li>
              Google Analytics sets the cookies <code>_ga</code> and <code>_ga_…</code> (they keep for up
              to 2 years) to recognise returning visits. Your choice itself is stored in the cookie{" "}
              <code>gc_consent</code> for 6 months.
            </li>
            <li>
              Google processes the data on our behalf. It may be transferred to the United States under the
              EU–US Data Privacy Framework. Google Analytics 4 does not store IP addresses.
            </li>
            <li>We have switched off advertising features and Google signals. Nothing is sold.</li>
            <li>The legal basis is your consent (GDPR art. 6(1)(a)). Saying no changes nothing on the site.</li>
            <li>
              You can change your mind at any time with <strong>Cookie settings</strong> at the bottom of
              every page; saying no also deletes the Google Analytics cookies.
            </li>
          </ul>
        </>
      )}

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
