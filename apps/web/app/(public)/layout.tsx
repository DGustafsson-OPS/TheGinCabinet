// Layout for the public website: forest masthead, cream content, footer (spec §2).
// The "(public)" folder name is a *route group*: it organises files but does
// not appear in the URL, so app/(public)/page.tsx is the home page "/".
//
// Age gate: until the visitor has confirmed they're old enough (a cookie),
// every public page, whichever one they arrive on, is drawn behind the
// "Are you 18 or older?" gate. Checking the cookie here on the server means
// the content never flashes up first, and it works without JavaScript.
//
// Analytics: when GA_MEASUREMENT_ID is set, visitors who passed the gate are
// asked once whether Google Analytics may run. Google's script is only loaded
// after they accept (see lib/consent.ts).
import { cookies } from "next/headers";
import Link from "next/link";

import AgeGate from "@/components/AgeGate";
import ConsentBanner from "@/components/ConsentBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PublicHeader from "@/components/PublicHeader";
import ReturnPathInput from "@/components/ReturnPathInput";
import { AGE_COOKIE } from "@/lib/age-gate";
import { CONSENT_COOKIE, gaMeasurementId } from "@/lib/consent";

import gate from "./age-gate.module.css";
import consentStyles from "./consent.module.css";
import styles from "./public.module.css";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const ageConfirmed = jar.get(AGE_COOKIE)?.value === "1";
  const gaId = gaMeasurementId();
  const consent = jar.get(CONSENT_COOKIE)?.value; // "analytics", "necessary" or undefined
  const askConsent = Boolean(gaId) && ageConfirmed && consent !== "analytics" && consent !== "necessary";
  const analyticsOn = Boolean(gaId) && ageConfirmed && consent === "analytics";

  return (
    <>
      {!ageConfirmed && <AgeGate />}
      {askConsent && <ConsentBanner />}
      {analyticsOn && gaId && <GoogleAnalytics id={gaId} />}
      {/* `inert`: nothing behind the gate can be clicked, focused or read aloud. */}
      <div inert={!ageConfirmed} className={ageConfirmed ? undefined : gate.gated}>
        <PublicHeader />
        <main id="main">{children}</main>
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <span>© The Gin Cabinet</span>
            <Link href="/privacy">Privacy</Link>
            {gaId && (
              // A form, not a link: it clears the choice on the server, then
              // the page reloads with the banner. Works without JavaScript.
              <form method="post" action="/consent">
                <ReturnPathInput />
                <button type="submit" name="choice" value="reset" className={consentStyles.settingsButton}>
                  Cookie settings
                </button>
              </form>
            )}
          </div>
        </footer>
        {askConsent && <div className={consentStyles.spacer} aria-hidden="true" />}
      </div>
    </>
  );
}
