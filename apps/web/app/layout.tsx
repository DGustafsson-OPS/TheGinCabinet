// The root layout wraps every page on the site.
import type { Metadata, Viewport } from "next";

import HydrationMarker from "@/components/HydrationMarker";
import { DEFAULT_DESCRIPTION, getSite } from "@/lib/public-api";

import "@/styles/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  // The description comes from Admin → Settings → Website. If the API can't be
  // reached (e.g. while the site is being built), the built-in text is used.
  const site = await getSite().catch(() => null);
  return {
    // Base for canonical and social-image URLs. Set SITE_URL in production.
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    title: { default: "The Gin Cabinet", template: "%s · The Gin Cabinet" },
    description: site?.meta_description || DEFAULT_DESCRIPTION,
  };
}

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
        <HydrationMarker />
      </body>
    </html>
  );
}
