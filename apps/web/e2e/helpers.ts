// Shared helpers for the browser tests.
import { type APIRequestContext, expect, type Page, request, test } from "@playwright/test";

import { freshCode } from "./totp";

export const USERNAME = process.env.E2E_USERNAME ?? "e2e-admin";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";
export const SECRET = process.env.E2E_TOTP_SECRET ?? "";
export const HAS_CREDENTIALS = Boolean(PASSWORD && SECRET);

/** The admin toast area ("Saved." etc.), found by its accessible name. */
export const toasts = (page: Page) => page.getByRole("status", { name: "Notifications" });

/** A unique suffix so repeated runs never create duplicate gins. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/**
 * One admin session shared by the tests in this worker. Authenticator codes
 * now work only once, and a fresh code comes every 30 seconds, so signing in
 * for every test would make the run minutes slower. Tests that check signing
 * in itself still use the real form (see admin.spec.ts).
 */
let shared: { token: string; csrf: string } | null = null;

async function sharedSession(baseURL: string): Promise<{ token: string; csrf: string }> {
  // The Origin header mimics a browser, so the API's CSRF origin check passes.
  const headers = { Origin: baseURL };
  if (shared) {
    // Still signed in? (A test may have ended the session, e.g. by a password change.)
    const check = await request.newContext({ baseURL, extraHTTPHeaders: { ...headers, Cookie: `gc_session=${shared.token}` } });
    const alive = (await check.get("/api/v1/auth/session")).ok();
    await check.dispose();
    if (alive) return shared;
  }
  const api = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const login = await api.post("/api/v1/auth/login", { data: { username: USERNAME, password: PASSWORD } });
  expect(login.ok()).toBe(true);
  const session = await api.post("/api/v1/auth/mfa/verify", { data: { code: await freshCode(SECRET) } });
  expect(session.ok()).toBe(true);
  const csrf = (await session.json()).csrf_token as string;
  const cookie = (await api.storageState()).cookies.find((c) => c.name === "gc_session");
  expect(cookie).toBeTruthy();
  await api.dispose();
  shared = { token: cookie!.value, csrf };
  return shared;
}

/** An API client signed in as the test admin, for preparing data quickly. */
export async function signedInApi(baseURL: string): Promise<{ api: APIRequestContext; csrf: string }> {
  const { token, csrf } = await sharedSession(baseURL);
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL, Cookie: `gc_session=${token}` } });
  return { api, csrf };
}

/**
 * Open a page and wait until React has made it interactive (see
 * components/HydrationMarker.tsx). Typing before that can be lost.
 */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** Open the admin area as the signed-in test admin (shares one session). */
export async function signInThroughUi(page: Page) {
  const baseURL = test.info().project.use.baseURL!;
  const { token } = await sharedSession(baseURL);
  await page.context().addCookies([{ name: "gc_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await gotoReady(page, "/juniper");
  await expect(page).toHaveURL(/\/juniper$/);
}

/** Create a gin through the API and return its id and name. */
export async function createGin(
  api: APIRequestContext,
  csrf: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string; display_name: string; version: number }> {
  const response = await api.post("/api/v1/admin/gins", {
    headers: { "X-CSRF-Token": csrf },
    data: { brand: "E2E", name: `Gin ${unique()}`, abv: "41.5", ...overrides },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
