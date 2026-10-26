// End-to-end tests for Phase 1 (sign-in, admin shell) and the dashboard.
// They need a running API + website and a test admin; see e2e/README.md.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, PASSWORD, SECRET, USERNAME, signInThroughUi, signedInApi } from "./helpers";
import { totp } from "./totp";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("home page has a hero and a working skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "The Gin Cabinet" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
});

test("admin pages send signed-out visitors to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toBeFocused();
});

test("a wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login");
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
  await page.goto("/login");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const codeBox = page.getByLabel("Authentication code");
  await expect(codeBox).toBeFocused();
  await expect(codeBox).toHaveValue("");
  await codeBox.fill(totp(SECRET));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

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
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("the sidebar shows who is signed in", async ({ page }) => {
  await signInThroughUi(page);
  await expect(page.getByText(/Signed in as/)).toBeVisible();
});
