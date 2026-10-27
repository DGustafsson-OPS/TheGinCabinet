// Server-side calls to the *public* API: no cookies are sent, so the answer is
// exactly what any visitor would get (spec §8 public endpoints).
import "server-only";

import { cache } from "react";

import type { PublicSite } from "@/lib/types";

const API_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

/** The site's own address, for canonical URLs and social images. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function publicGet<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_URL}/api/v1/public${path}`, {
    headers: { accept: "application/json" },
    // Always fresh: publishing or withdrawing shows up immediately (spec §11).
    cache: "no-store",
  });
  return response.ok ? ((await response.json()) as T) : null;
}

/**
 * The site's settings and page texts. React's cache() makes the layout and
 * the page share one request per page view instead of asking twice.
 */
export const getSite = cache(() => publicGet<PublicSite>("/site"));

/** One editable page text (Admin → Page texts); "" if the API is unreachable. */
export function siteText(site: PublicSite | null, key: string): string {
  return site?.texts?.[key] ?? "";
}
