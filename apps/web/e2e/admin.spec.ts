// End-to-end tests for Phase 1 (sign-in, admin shell) and the dashboard.
// They need a running API + website and a test admin; see e2e/README.md.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, PASSWORD, SECRET, USERNAME, gotoReady, signInThroughUi, signedInApi } from "./helpers";
import { freshCode } from "./totp";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("home page has a hero and a working skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "The Gin Cabinet" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
});

test("admin pages send signed-out visitors to the login page", async ({ page }) => {
  await page.goto("/juniper");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toBeFocused();
});

test("a wrong password shows a clear error", async ({ page }) => {
  await gotoReady(page, "/login");
  // An unknown username, so repeated test runs never lock out the real test admin.
  await page.getByLabel("Username").fill("nobody-here");
  await page.getByLabel("Password").fill("definitely wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That username and password don't match.")).toBeVisible();
});

test("two-step sign-in, dashboard numbers, mobile menu and sign-out", async ({ page, baseURL }) => {
  // Prepare: add a gin and a purchase through the API.
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await api.post("/api/v1/admin/gins", {
    headers: { "X-CSRF-Token": csrf },
    data: { brand: "E2E Test", name: `Gin ${Date.now().toString(36)}`, abv: "41.5" },
  });
  expect(gin.status()).toBe(201);
  const purchase = await api.post("/api/v1/admin/purchases", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      purchased_on: "2026-10-01",
      retailer: "E2E Shop",
      currency: "SEK",
      lines: [{ gin_id: (await gin.json()).id, size_ml: 700, quantity: 2, unit_price: "300" }],
    },
  });
  expect(purchase.status()).toBe(201);
  const expected = await (await api.get("/api/v1/admin/dashboard")).json();
  await api.dispose();

  // Step 1 → step 2: the code box must start empty (regression test).
  await gotoReady(page, "/login");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const codeBox = page.getByLabel("Authentication code");
  await expect(codeBox).toBeFocused();
  await expect(codeBox).toHaveValue("");
  await codeBox.fill(await freshCode(SECRET));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/juniper$/);

  // The tiles show what the API reports.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const tile = (label: string) => page.locator(".card").filter({ hasText: label });
  await expect(tile("Unique gins")).toContainText(String(expected.unique_gins));
  await expect(tile("Bottles in the cabinet")).toContainText(String(expected.physical_bottles));
  await expect(tile("Open bottles")).toContainText(String(expected.open_bottles));
  await expect(tile("Inventory value")).toContainText("SEK");

  // Mobile: the sidebar collapses behind a Menu button.
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(nav).toBeVisible();

  // Sign out, and the admin area is closed again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/juniper");
  await expect(page).toHaveURL(/\/login$/);
});

test("the sidebar shows who is signed in", async ({ page }) => {
  await signInThroughUi(page);
  await expect(page.getByText(/Signed in as/)).toBeVisible();
});

test("every admin page sends signed-out visitors to the login page", async ({ page }) => {
  // One URL per admin page file (ids don't need to exist: the check comes first).
  const urls = [
    "/juniper", "/juniper/gins", "/juniper/gins/new", "/juniper/gins/x", "/juniper/distilleries",
    "/juniper/bottles", "/juniper/bottles/new", "/juniper/bottles/x", "/juniper/purchases",
    "/juniper/purchases/new", "/juniper/purchases/x", "/juniper/wishlist", "/juniper/wishlist/x/convert",
    "/juniper/media", "/juniper/media/x", "/juniper/tastings", "/juniper/tastings/new", "/juniper/tastings/x",
    "/juniper/reviews", "/juniper/reviews/new", "/juniper/reviews/x", "/juniper/reviews/x/preview",
    "/juniper/reviews/x/revisions", "/juniper/cocktails", "/juniper/cocktails/new", "/juniper/cocktails/x",
    "/juniper/blog", "/juniper/blog/new", "/juniper/blog/categories", "/juniper/blog/x/edit", "/juniper/blog/x/preview",
    "/juniper/blog/x/revisions", "/juniper/settings", "/juniper/audit", "/juniper/tonics",
    "/juniper/tonics/new", "/juniper/tonics/x",
  ];
  for (const url of urls) {
    await page.goto(url);
    await expect(page, `${url} should redirect`).toHaveURL(/\/login$/);
  }
});

test("the old /admin address doesn't exist and doesn't point to the new one", async ({ page }) => {
  for (const url of ["/admin", "/admin/gins"]) {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(404);
    await expect(page).toHaveURL(new RegExp(`${url}$`)); // no redirect giving the real address away
  }
});

test("admin pages tell search engines not to index them", async ({ request }) => {
  const response = await request.get("/juniper", { maxRedirects: 0 });
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});
