// Layout for the public website: forest masthead, cream content, footer (spec §2).
// The "(public)" folder name is a *route group*: it organises files but does
// not appear in the URL, so app/(public)/page.tsx is the home page "/".
//
// Age gate: until the visitor has confirmed they're old enough (a cookie),
// every public page, whichever one they arrive on, is drawn behind the
// "Are you 18 or older?" gate. Checking the cookie here on the server means
// the content never flashes up first, and it works without JavaScript.
import { cookies } from "next/headers";
import Link from "next/link";

import AgeGate from "@/components/AgeGate";
import PublicHeader from "@/components/PublicHeader";
import { AGE_COOKIE } from "@/lib/age-gate";

import gate from "./age-gate.module.css";
import styles from "./public.module.css";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const ageConfirmed = (await cookies()).get(AGE_COOKIE)?.value === "1";
  return (
    <>
      {!ageConfirmed && <AgeGate />}
      {/* `inert`: nothing behind the gate can be clicked, focused or read aloud. */}
      <div inert={!ageConfirmed} className={ageConfirmed ? undefined : gate.gated}>
        <PublicHeader />
        <main id="main">{children}</main>
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <span>© The Gin Cabinet</span>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
