// Shown for any URL without a page, including public pages planned for later phases.
import Link from "next/link";
import { connection } from "next/server";

export default async function NotFound() {
  // Render per request, not once at build time, so Next.js can put this
  // request's script nonce on the page (see lib/csp.ts).
  await connection();
  return (
    <main id="main" style={{ maxWidth: 720, margin: "0 auto", padding: "64px 16px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>Still distilling</h1>
      <p>This page doesn&apos;t exist yet, or it has moved.</p>
      <Link className="button button-primary" href="/">
        Back to the cabinet
      </Link>
    </main>
  );
}
