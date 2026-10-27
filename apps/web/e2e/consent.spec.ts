// Our own cookie-consent manager (EU rules): Google's script must not load
// until the visitor accepts, rejecting must be as easy as accepting, choices
// can be made per category and changed later, and each choice is logged as
// proof of consent.
//
// The test server runs with a made-up GA_MEASUREMENT_ID (G-E2ETEST1), and every
// request to Google is blocked here, so these tests never contact Google.
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signedInApi } from "./helpers";

const GA_ID = "G-E2ETEST1";
const host = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname;

// Past the age gate, but no cookie choice yet.
test.use({
  storageState: {
    cookies: [{ name: "gc_age_ok", value: "1", domain: host, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  },
});

/** Block and record every request to Google's servers. */
async function watchGoogle(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(/google(tagmanager|-analytics)\.com/, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  return requests;
}

const banner = (page: Page) => page.getByRole("region", { name: "May we measure visits?" });
const consentCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((c) => c.name === "gc_consent")?.value ?? "";

test("nothing from Google loads until the visitor accepts", async ({ page, context }) => {
  const google = await watchGoogle(page);
  await gotoReady(page, "/collection");
  await expect(banner(page)).toBeVisible();
  // Both answers are the same kind of button: neither is nudged.
  const accept = banner(page).getByRole("button", { name: "Accept all" });
  const reject = banner(page).getByRole("button", { name: "Reject all" });
  expect(await accept.getAttribute("class")).toBe(await reject.getAttribute("class"));
  expect(google).toEqual([]);

  await accept.click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator(`script[src*="gtag/js?id=${GA_ID}"]`)).toHaveCount(1);
  await expect.poll(() => google.length).toBeGreaterThan(0); // tried to load (blocked here)
  expect(await consentCookie(context)).toMatch(/^v1\.[A-Za-z0-9]{16,}\.analytics$/);
});

test("Reject all keeps Google out and deletes GA cookies", async ({ page, context }) => {
  const google = await watchGoogle(page);
  // As if analytics had been accepted earlier: GA's own cookie is present.
  await context.addCookies([{ name: "_ga", value: "GA1.1.123.456", domain: host, path: "/" }]);
  await gotoReady(page, "/");
  await banner(page).getByRole("button", { name: "Reject all" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect(await consentCookie(context)).toMatch(/\.none$/);
  expect((await context.cookies()).map((c) => c.name)).not.toContain("_ga");

  await gotoReady(page, "/cocktails");
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect(google).toEqual([]);
});

test("choose per category in the banner, then change it on Cookie settings", async ({ page, context }) => {
  const google = await watchGoogle(page);
  await gotoReady(page, "/reviews");
  await banner(page).getByText("Choose cookies").click();
  const necessary = banner(page).getByRole("checkbox", { name: /Necessary/ });
  await expect(necessary).toBeChecked();
  await expect(necessary).toBeDisabled(); // always on
  await expect(banner(page).getByRole("checkbox", { name: "Analytics" })).not.toBeChecked(); // off until chosen
  await banner(page).getByRole("button", { name: "Save my choices" }).click();
  await expect(page).toHaveURL(/\/reviews$/);
  await expect(banner(page)).toHaveCount(0);
  expect(google).toEqual([]);

  // The footer link opens Cookie settings, which shows the current choice.
  const firstValue = await consentCookie(context);
  await page.getByRole("link", { name: "Cookie settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cookie settings" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("You allow only necessary cookies.");
  await expect(page.getByRole("cell", { name: "_ga", exact: true })).toBeVisible(); // the cookie list
  await page.getByRole("checkbox", { name: "Analytics" }).check();
  await page.getByRole("button", { name: "Save my choices" }).click();
  await expect(page.getByRole("status")).toHaveText("You allow analytics cookies.");
  // Same browser, same consent ID: its records stay linked.
  expect((await consentCookie(context)).split(".")[1]).toBe(firstValue.split(".")[1]);
});

test("the banner never shows before the age gate, nor in the admin area", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await gotoReady(page, "/");
  await expect(page.getByRole("dialog", { name: "Are you 18 or older?" })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await gotoReady(page, "/login");
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  // Cookie settings is readable even before the age gate.
  await gotoReady(page, "/cookie-settings");
  await expect(page.getByRole("heading", { level: 1, name: "Cookie settings" })).toBeVisible();
  await context.close();
});

test("the privacy page explains the analytics", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await expect(page.getByRole("heading", { name: "Analytics (only with your permission)" })).toBeVisible();
});

test("each choice is recorded as proof of consent", async ({ page, baseURL }) => {
  test.skip(!HAS_CREDENTIALS, "needs the e2e admin account");
  const { api } = await signedInApi(baseURL!);
  const before = await (await api.get("/api/v1/admin/consent/stats")).json();
  await gotoReady(page, "/");
  await banner(page).getByRole("button", { name: "Accept all" }).click();
  await expect(banner(page)).toHaveCount(0);
  const after = await (await api.get("/api/v1/admin/consent/stats")).json();
  expect(after.total).toBe(before.total + 1);
  expect(after.analytics_allowed).toBe(before.analytics_allowed + 1);
  await api.dispose();
});
