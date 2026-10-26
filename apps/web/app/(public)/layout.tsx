// Layout for the public website: forest masthead, cream content, footer (spec §2).
// The "(public)" folder name is a *route group*: it organises files but does
// not appear in the URL, so app/(public)/page.tsx is the home page "/".
import Link from "next/link";

import PublicHeader from "@/components/PublicHeader";

import styles from "./public.module.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main">{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© The Gin Cabinet</span>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </>
  );
}
