// End-to-end test of Settings & admins (spec A10). Password and MFA changes
// are covered by the API tests instead: changing them here would lock the
// shared test account out of every other test.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, PASSWORD, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("edit the website settings, see them on the About page, check the audit log", async ({ page, browser }) => {
  const contact = `hello-${unique()}@gincabinet.example`;
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/settings");

  // Website tab (the first one).
  await page.getByLabel("Public contact email").fill(contact);
  await page.getByLabel("About page text").fill("We started with one bottle.\n\nNow there are many.");
  await page.getByRole("button", { name: "Save website settings" }).click();
  await expect(toasts(page)).toContainText("Website settings saved.");

  const visitor = await browser.newPage();
  await gotoReady(visitor, "/about");
  await expect(visitor.getByText("We started with one bottle.")).toBeVisible();
  await expect(visitor.getByRole("link", { name: contact })).toHaveAttribute("href", `mailto:${contact}`);
  await visitor.close();

  // Recovery codes: needs the password, then shows ten new codes once.
  await page.getByRole("tab", { name: "Password & sign-in" }).click();
  const recovery = page.getByRole("region", { name: "Recovery codes" });
  await recovery.getByLabel("Current password").fill("not my password");
  await recovery.getByRole("button", { name: "Make new recovery codes" }).click();
  await expect(recovery.getByRole("alert")).toContainText("current password is not correct");
  await recovery.getByLabel("Current password").fill(PASSWORD);
  await recovery.getByRole("button", { name: "Make new recovery codes" }).click();
  await expect(recovery.getByText("shown only this once")).toBeVisible();
  await expect(recovery.locator("ol li")).toHaveCount(10);

  // The admins tab lists the account; the audit log records the changes.
  await page.getByRole("tab", { name: "Admins" }).click();
  await expect(page.getByRole("cell", { name: /\(you\)/ })).toBeVisible();
  await gotoReady(page, "/juniper/audit");
  await expect(page.getByText(/changed the website settings/).first()).toBeVisible();
  await expect(page.getByText(/made new recovery codes/).first()).toBeVisible();
});
