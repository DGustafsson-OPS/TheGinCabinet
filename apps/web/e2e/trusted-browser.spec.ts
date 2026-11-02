// "Trust this browser for 30 days": after one sign-in with the box ticked, the
// password alone signs in on this browser; "Forget trusted browsers" ends it.
import { expect, type Page, test } from "@playwright/test";

import { HAS_CREDENTIALS, PASSWORD, SECRET, USERNAME, gotoReady, toasts } from "./helpers";
import { freshCode } from "./totp";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

async function enterPassword(page: Page) {
  await gotoReady(page, "/login");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("trust this browser, sign in with only the password, then forget it", async ({ page }) => {
  // 1. Password + code, with "Trust this browser for 30 days" ticked.
  await enterPassword(page);
  await page.getByLabel("Authentication code").fill(await freshCode(SECRET));
  await page.getByLabel("Trust this browser for 30 days").check();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/juniper$/);
  await signOut(page);

  // 2. The password alone is enough on this browser.
  await enterPassword(page);
  await expect(page).toHaveURL(/\/juniper$/);

  // 3. Settings lists it; forgetting means the code is asked for again.
  await gotoReady(page, "/juniper/settings");
  await page.getByRole("tab", { name: "Password & sign-in" }).click();
  const section = page.getByRole("region", { name: "Trusted browsers" });
  await expect(section).toContainText("(this browser)");
  await section.getByRole("button", { name: "Forget trusted browsers" }).click();
  await page.getByRole("button", { name: "Forget them" }).click();
  await expect(toasts(page)).toContainText("Trusted browsers forgotten.");
  await expect(section).toContainText("No trusted browsers.");
  await signOut(page);

  await enterPassword(page);
  await expect(page.getByLabel("Authentication code")).toBeVisible();
});
