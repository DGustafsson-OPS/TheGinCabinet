// Shared helpers for the browser tests.
import { type APIRequestContext, expect, type Page, request } from "@playwright/test";

import { totp } from "./totp";

export const USERNAME = process.env.E2E_USERNAME ?? "e2e-admin";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";
export const SECRET = process.env.E2E_TOTP_SECRET ?? "";
export const HAS_CREDENTIALS = Boolean(PASSWORD && SECRET);

/** The admin toast area ("Saved." etc.), found by its accessible name. */
export const toasts = (page: Page) => page.getByRole("status", { name: "Notifications" });

/** A unique suffix so repeated runs never create duplicate gins. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** An API client signed in as the test admin, for preparing data quickly. */
export async function signedInApi(baseURL: string): Promise<{ api: APIRequestContext; csrf: string }> {
  // The Origin header mimics a browser, so the API's CSRF origin check passes.
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const login = await api.post("/api/v1/auth/login", { data: { username: USERNAME, password: PASSWORD } });
  expect(login.ok()).toBe(true);
  const session = await api.post("/api/v1/auth/mfa/verify", { data: { code: totp(SECRET) } });
  expect(session.ok()).toBe(true);
  const csrf = (await session.json()).csrf_token as string;
  return { api, csrf };
}

/** Sign in through the real login form. */
export async function signInThroughUi(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Authentication code").fill(totp(SECRET));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Create a gin through the API and return its id and name. */
export async function createGin(
  api: APIRequestContext,
  csrf: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; display_name: string; version: number }> {
  const response = await api.post("/api/v1/admin/gins", {
    headers: { "X-CSRF-Token": csrf },
    data: { brand: "E2E", name: `Gin ${unique()}`, abv: "41.5", ...overrides },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
