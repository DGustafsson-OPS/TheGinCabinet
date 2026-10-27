// Cookie settings (our own consent manager): shows what the visitor has
// chosen, lets them change it, and lists every cookie the site uses (the
// "cookie declaration").
//
// It sits outside the public (age-gated) area on purpose: it has no alcohol
// content, and anyone should be able to read what cookies are used.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import ConsentForm from "@/components/ConsentForm";
import PublicHeader from "@/components/PublicHeader";
import { CONSENT_CATEGORIES, CONSENT_COOKIE, gaMeasurementId, parseConsent } from "@/lib/consent";

import consentStyles from "../(public)/consent.module.css";
import prose from "../(public)/prose.module.css";
import site from "../(public)/public.module.css";

export const metadata: Metadata = {
  title: "Cookie settings",
  description: "Which cookies The Gin Cabinet uses, and your choices.",
  alternates: { canonical: "/cookie-settings" },
};

export default async function CookieSettingsPage() {
  const analyticsAvailable = Boolean(gaMeasurementId());
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  const categories = CONSENT_CATEGORIES.filter((c) => c.required || analyticsAvailable);

  return (
    <>
      <PublicHeader />
      <main id="main">
        <article className={prose.prose}>
          <h1>Cookie settings</h1>
          {analyticsAvailable ? (
            <>
              <p className={prose.lead} role="status">
                {consent === null
                  ? "You haven't made a choice yet, so only necessary cookies are used."
                  : consent.analytics
                    ? "You allow analytics cookies."
                    : "You allow only necessary cookies."}
              </p>
              <p>Change your choice here at any time. Switching analytics off also deletes its cookies.</p>
              <div className={consentStyles.settingsPanel}>
                <ConsentForm idPrefix="settings" analytics={consent?.analytics ?? false} returnTo="/cookie-settings" />
                <form method="post" action="/consent" className={consentStyles.quick}>
                  <input type="hidden" name="next" value="/cookie-settings" />
                  <button className="button button-secondary" type="submit" name="choice" value="accept_all">
                    Accept all
                  </button>
                  <button className="button button-secondary" type="submit" name="choice" value="reject_all">
                    Reject all
                  </button>
                </form>
              </div>
            </>
          ) : (
            <p className={prose.lead}>We only use necessary cookies, so there is nothing to choose.</p>
          )}

          <h2>Cookies we use</h2>
          {categories.map((category) => (
            <section key={category.key} aria-labelledby={`cookies-${category.key}`}>
              <h3 id={`cookies-${category.key}`}>{category.title}</h3>
              <p>{category.description}</p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Cookie</th>
                      <th scope="col">Purpose</th>
                      <th scope="col">Kept for</th>
                      <th scope="col">Set by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.cookies.map((c) => (
                      <tr key={c.name}>
                        <td>
                          <code>{c.name}</code>
                        </td>
                        <td>{c.purpose}</td>
                        <td>{c.lifetime}</td>
                        <td>{c.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p>
            More about how we handle data: <Link href="/privacy">Privacy</Link>.
          </p>
        </article>
      </main>
      <footer className={site.footer}>
        <div className={site.footerInner}>
          <span>© The Gin Cabinet</span>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </>
  );
}
