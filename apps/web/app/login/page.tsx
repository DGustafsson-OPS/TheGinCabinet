// /login: administrator sign-in (spec §3). There is no sign-up page (spec A10).
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/server-api";

import LoginForm from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false }, // keep the admin entrance out of search engines
};

export default async function LoginPage() {
  const session = await getSession();
  if (session.authenticated) {
    redirect("/juniper");
  }

  return (
    <main id="main" className={styles.page}>
      <div className={styles.panel}>
        <Link href="/" className={styles.brand}>
          The Gin Cabinet
        </Link>
        <h1 className={styles.title}>Administrator sign-in</h1>
        <LoginForm initialStep={session.mfa_pending ? "mfa" : "password"} />
      </div>
    </main>
  );
}
