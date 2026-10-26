// The root layout wraps every page on the site.
import type { Metadata, Viewport } from "next";

import "@/styles/globals.css";

export const metadata: Metadata = {
  // Base for canonical and social-image URLs. Set SITE_URL in production.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "The Gin Cabinet", template: "%s · The Gin Cabinet" },
  description: "A shared gin collection: profiles, reviews, cocktails and the Gin Journal.",
};

export const viewport: Viewport = {
  themeColor: "#19251f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Lets keyboard users jump past the navigation (spec §2 accessibility). */}
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
