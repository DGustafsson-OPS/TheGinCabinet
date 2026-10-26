// Shell for every /admin page: forest sidebar + warm-white workspace (spec §2).
//
// The layout only *displays* who is signed in. The real access check happens
// in each page via requireAdmin(), because Next.js layouts don't re-run on
// every navigation (see the Next.js authentication guide).
import type { Metadata } from "next";

import AdminSidebar from "@/components/AdminSidebar";
import AdminProvider from "@/components/admin/AdminProvider";
import { getSession } from "@/lib/server-api";

import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · The Gin Cabinet" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.authenticated || !session.user || !session.csrf_token) {
    return <>{children}</>; // the page itself redirects to /login
  }

  return (
    <AdminProvider csrfToken={session.csrf_token}>
      <div className={styles.shell}>
        <AdminSidebar displayName={session.user.display_name} csrfToken={session.csrf_token} />
        <main id="main" className={styles.workspace}>
          {children}
        </main>
      </div>
    </AdminProvider>
  );
}
