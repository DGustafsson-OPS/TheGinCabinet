// Cookie consent for Google Analytics (EU rules): Google's script must not
// load until the visitor accepts, rejecting must be as easy as accepting, and
// the choice can be changed later.
//
// The test server runs with a made-up GA_MEASUREMENT_ID (G-E2ETEST1), and every
// request to Google is blocked here, so these tests never contact Google.
import { type Page, expect, test } from "@playwright/test";

import { gotoReady } from "./helpers";

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

test("nothing from Google loads until the visitor accepts", async ({ page, context }) => {
  const google = await watchGoogle(page);
  await gotoReady(page, "/collection");
  await expect(banner(page)).toBeVisible();
  // Both answers are the same kind of button: neither is nudged.
  const accept = page.getByRole("button", { name: "Accept analytics" });
  const reject = page.getByRole("button", { name: "Reject" });
  expect(await accept.getAttribute("class")).toBe(await reject.getAttribute("class"));
  expect(google).toEqual([]);

  await accept.click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator(`script[src*="gtag/js?id=${GA_ID}"]`)).toHaveCount(1);
  await expect.poll(() => google.length).toBeGreaterThan(0); // tried to load (blocked here)
  const consent = (await context.cookies()).find((c) => c.name === "gc_consent");
  expect(consent?.value).toBe("analytics");
});

test("Reject keeps Google out, deletes GA cookies, and Cookie settings asks again", async ({ page, context }) => {
  const google = await watchGoogle(page);
  // As if analytics had been accepted earlier: GA's own cookie is present.
  await context.addCookies([{ name: "_ga", value: "GA1.1.123.456", domain: host, path: "/" }]);
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(banner(page)).toHaveCount(0);
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).toContain("gc_consent");
  expect(names).not.toContain("_ga");

  // Moving around: still nothing from Google.
  await gotoReady(page, "/cocktails");
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect(google).toEqual([]);

  // Changing your mind: the footer's Cookie settings brings the banner back.
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(page).toHaveURL(/\/cocktails$/);
  await expect(banner(page)).toBeVisible();
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
  await context.close();
});

test("the privacy page explains the analytics", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await expect(page.getByRole("heading", { name: "Analytics (only with your permission)" })).toBeVisible();
});
