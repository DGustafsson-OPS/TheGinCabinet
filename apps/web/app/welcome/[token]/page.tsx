// /welcome/<link>: where an invited person sets up their account (Settings →
// People → Invite). They choose their own password and add The Gin Cabinet
// to their own authenticator app; nobody else ever sees either.
import type { Metadata } from "next";
import Link from "next/link";

import { apiGet } from "@/lib/server-api";
import type { InviteInfo } from "@/lib/types";

import styles from "../../login/login.module.css";
import WelcomeForm from "./WelcomeForm";

export const metadata: Metadata = {
  title: "Set up your account",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

export default async function WelcomePage({ params }: { params: Params }) {
  const { token } = await params;
  const { data: invite } = await apiGet<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`);
  return (
    <main id="main" className={styles.page}>
      <div className={styles.panel}>
        <Link href="/" className={styles.brand}>
          The Gin Cabinet
        </Link>
        {invite ? (
          <>
            <h1 className={styles.title}>Welcome, {invite.display_name}</h1>
            <p>
              You&apos;ve been invited as {invite.role === "admin" ? "an admin" : "an editor"}. Choose a password and
              set up sign-in codes; then you can sign in as <strong>{invite.username}</strong>.
            </p>
            <WelcomeForm token={token} username={invite.username} />
          </>
        ) : (
          <>
            <h1 className={styles.title}>This link doesn&apos;t work</h1>
            <p>
              It may have been used already or expired (links last 7 days). Ask the admin who invited you for a new
              one.
            </p>
            <p>
              Already set up? <Link href="/login">Sign in</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
