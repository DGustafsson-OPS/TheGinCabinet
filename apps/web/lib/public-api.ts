// Server-side calls to the *public* API: no cookies are sent, so the answer is
// exactly what any visitor would get (spec §8 public endpoints).
import "server-only";

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
