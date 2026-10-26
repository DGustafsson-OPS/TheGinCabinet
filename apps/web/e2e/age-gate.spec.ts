// The 18+ age gate: every public page, whichever one a visitor arrives on,
// asks "Are you 18 or older?" until they confirm.
import { expect, test } from "@playwright/test";

import { gotoReady } from "./helpers";

// Start these tests as a brand-new visitor: no "already confirmed" cookie.
test.use({ storageState: { cookies: [], origins: [] } });

const gate = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Are you 18 or older?" });

test("a deep link shows the gate first; Yes returns to that exact page", async ({ page }) => {
  await gotoReady(page, "/cocktails?method=stir");
  await expect(gate(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, I'm 18 or older" })).toBeFocused();
  // The page behind is inert: its links can't be focused or clicked.
  const collection = page.locator("header a", { hasText: "Collection" });
  expect(await collection.evaluate((link: HTMLElement) => (link.focus(), document.activeElement === link))).toBe(false);
  await collection.click({ force: true, timeout: 2000 }).catch(() => {});
  await expect(page).toHaveURL(/\/cocktails\?method=stir$/); // the click went nowhere

  await page.getByRole("button", { name: "Yes, I'm 18 or older" }).click();
  await expect(page).toHaveURL(/\/cocktails\?method=stir$/);
  await expect(gate(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Collection" })).toBeVisible();

  // Remembered: other pages open straight away.
  await gotoReady(page, "/about");
  await expect(gate(page)).toHaveCount(0);
});

test("No leads to an explanation, and the gate stays until someone says Yes", async ({ page }) => {
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page).toHaveURL(/\/age-restricted$/);
  await expect(page.getByRole("heading", { name: "Sorry, this site is for adults" })).toBeVisible();
  await gotoReady(page, "/collection");
  await expect(gate(page)).toBeVisible();
});

test("the admin sign-in page is not behind the gate", async ({ page }) => {
  await gotoReady(page, "/login");
  await expect(gate(page)).toHaveCount(0);
  await expect(page.getByLabel("Username")).toBeVisible();
});

test("the gate works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/distilleries");
  await expect(gate(page)).toBeVisible();
  await page.getByRole("button", { name: "Yes, I'm 18 or older" }).click();
  await expect(page).toHaveURL(/\/distilleries$/); // found its way back via the Referer header
  await expect(gate(page)).toHaveCount(0);
  await context.close();
});

test("the gate can't be used to redirect people to another website", async ({ request }) => {
  for (const next of ["https://evil.example/", "//evil.example/", "/\\evil.example"]) {
    const response = await request.post("/age-check", { form: { answer: "yes", next }, maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toBe("/");
  }
});
