// Server-side access to the FastAPI backend: the "data access layer" that the
// Next.js authentication guide recommends.
//
// `import "server-only"` makes the build fail if a browser component ever
// imports this file, so this code (and the internal API address) never
// reaches the browser.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Session } from "./types";

const API_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

/** Call the API as the current visitor by forwarding their cookies. */
export async function apiGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const cookieHeader = (await cookies()).toString(); // Next 16: cookies() is async
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { cookie: cookieHeader, accept: "application/json" },
    cache: "no-store", // private data: never cache between visitors
  });
  if (!response.ok) {
    return { status: response.status, data: null };
  }
  return { status: response.status, data: (await response.json()) as T };
}

/**
 * Who is signed in? `cache` remembers the answer for the rest of this one page
 * render, so the layout and the page can both ask without two API calls.
 */
export const getSession = cache(async (): Promise<Session> => {
  const { data } = await apiGet<Session>("/auth/session");
  return (
    data ?? {
      authenticated: false,
      mfa_pending: false,
      user: null,
      csrf_token: null,
      expires_at: null,
    }
  );
});

/** Use at the top of every admin page: sends visitors who aren't signed in to /login. */
export async function requireAdmin(): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const session = await getSession();
  if (!session.authenticated || !session.user) {
    redirect("/login");
  }
  return session as Session & { user: NonNullable<Session["user"]> };
}
