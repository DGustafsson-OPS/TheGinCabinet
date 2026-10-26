// Shown for any URL without a page, including public pages planned for later phases.
import Link from "next/link";

export default function NotFound() {
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
