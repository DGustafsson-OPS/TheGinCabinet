// People: an admin invites an editor, the editor sets up their own account
// from the link, signs in, and sees only the content side of the admin area.
// Then the admin changes the editor's display name.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";
import { freshCode, markUsed, totp } from "./totp";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

const EDITOR_PASSWORD = "an editor's long passphrase";

test("invite an editor, who sets up their own account and sees only content", async ({ page, browser }) => {
  const tag = unique();
  const username = `ed-${tag}`;
  const name = `Editor ${tag}`;

  // The admin invites them.
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/settings");
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByText("Invite someone…").click();
  const form = page.getByRole("form", { name: "Invite someone" });
  await form.getByLabel("Display name").fill(name);
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Email").fill(`${tag}@example.com`);
  await form.getByLabel("Role").selectOption("editor");
  await form.getByRole("button", { name: "Create invitation link" }).click();
  await expect(toasts(page)).toContainText(`${name} is invited`);
  const link = (await page.getByText(/\/welcome\//).textContent())!.trim();
  await expect(page.getByRole("cell", { name: new RegExp(`${name}.*invited`) })).toBeVisible();

  // The editor, in their own browser (no cookies), opens the link.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const editor = await context.newPage();
  await gotoReady(editor, link);
  await expect(editor.getByRole("heading", { name: `Welcome, ${name}` })).toBeVisible();
  // A weak password is refused before any sign-in key is shown.
  await editor.getByLabel("Choose a password").fill("aaaabbbbaaaa");
  await editor.getByLabel("Repeat the password").fill("aaaabbbbaaaa");
  await editor.getByRole("button", { name: "Next: sign-in codes" }).click();
  await expect(editor.getByRole("form", { name: "Step 1: your password" }).getByRole("alert")).toContainText(
    "stronger password",
  );
  await editor.getByLabel("Choose a password").fill(EDITOR_PASSWORD);
  await editor.getByLabel("Repeat the password").fill(EDITOR_PASSWORD);
  await editor.getByRole("button", { name: "Next: sign-in codes" }).click();
  const secret = (await editor.locator("code").first().textContent())!.trim();
  await editor.getByLabel("Code from the app").fill(totp(secret));
  markUsed(secret); // the next sign-in must use a newer code
  await editor.getByRole("button", { name: "Finish setting up" }).click();
  await expect(editor.getByRole("heading", { name: "Your account is ready" })).toBeVisible();
  await expect(editor.locator("ol li")).toHaveCount(10);

  // The link works only once.
  await gotoReady(editor, link);
  await expect(editor.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();

  // They sign in (with the next code: the setup code can't be used twice).
  await gotoReady(editor, "/login");
  await editor.getByLabel("Username").fill(username);
  await editor.getByLabel("Password").fill(EDITOR_PASSWORD);
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Authentication code").fill(await freshCode(secret));
  await editor.getByRole("button", { name: "Sign in" }).click();
  await expect(editor).toHaveURL(/\/juniper$/);

  // Content only: no inventory, messages or audit in the menu...
  const nav = editor.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Journal" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Page texts" })).toBeVisible();
  for (const hidden of ["Gins", "Bottles", "Purchases", "Messages", "Audit log"]) {
    await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  // ...no inventory figures on the dashboard, and admin pages explain why not.
  await expect(editor.getByText("Inventory value")).toHaveCount(0);
  await gotoReady(editor, "/juniper/bottles");
  await expect(editor.getByRole("heading", { name: "For admins only" })).toBeVisible();
  // Settings shows only their own tabs.
  await gotoReady(editor, "/juniper/settings");
  await expect(editor.getByRole("tab", { name: "My profile" })).toBeVisible();
  await expect(editor.getByRole("tab", { name: "People" })).toHaveCount(0);
  await expect(editor.getByRole("tab", { name: "Website" })).toHaveCount(0);

  // The admin changes the editor's display name (no password needed for that).
  await page.reload();
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByText(`Manage ${name}…`).click();
  const edit = page.getByRole("form", { name: `Edit ${name}` });
  await edit.getByLabel("Display name").fill(`${name} (renamed)`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page)).toContainText("account was saved");
  await expect(page.getByRole("cell", { name: `${name} (renamed)` })).toBeVisible();

  // The editor sees who changed their account.
  await gotoReady(editor, "/juniper/settings");
  await expect(editor.getByText(/changed your account details/)).toBeVisible();
  await context.close();
});
