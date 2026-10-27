// Every question is asked inside the page, never with a browser popup, and
// removing something always asks first.
import { type Page, expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, signedInApi, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

/** Fail the test if the browser shows any popup of its own (alert, confirm, "Leave site?"). */
function noBrowserPopups(page: Page): string[] {
  const popups: string[] = [];
  page.on("dialog", async (dialog) => {
    popups.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });
  return popups;
}

test("removing a purchase line asks first, inside the page", async ({ page }) => {
  const popups = noBrowserPopups(page);
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/purchases/new");
  await page.getByRole("button", { name: "Add another line" }).click();
  const remove = page.getByRole("button", { name: "Remove line 2" });

  // Cancel keeps the line.
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Remove line 2?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused(); // the safe choice
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(remove).toBeVisible();

  // Confirming removes it.
  await remove.click();
  await dialog.getByRole("button", { name: "Remove line" }).click();
  await expect(remove).toHaveCount(0);
  expect(popups).toEqual([]);
});

test("unsaved Journal edits: in-page warning on leaving, and a restorable copy after a reload", async ({ page, baseURL }) => {
  const popups = noBrowserPopups(page);
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const post = await (
    await api.post("/api/v1/admin/blog", {
      headers: { "X-CSRF-Token": csrf },
      data: { title: `Unsaved ${tag}`, body_blocks: [{ type: "paragraph", text: "Hello." }] },
    })
  ).json();
  await api.dispose();

  await signInThroughUi(page);
  const editUrl = `/juniper/blog/${post.id}/edit`;
  await gotoReady(page, editUrl);
  const title = page.getByLabel("Title", { exact: true });
  await title.fill(`Changed ${tag}`);

  // Clicking a link asks inside the page. "Stay" keeps the edit.
  const nav = page.getByRole("navigation", { name: "Admin" });
  await nav.getByRole("link", { name: "Gins" }).click();
  const leave = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Stay on this page" }).click();
  await expect(page).toHaveURL(new RegExp(`${editUrl}$`));
  await expect(title).toHaveValue(`Changed ${tag}`);

  // A reload (or closing the tab) can't ask in-page, so the edit was kept in
  // this browser and is offered back.
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const found = page.getByRole("region", { name: "Unsaved changes found" });
  await expect(found).toBeVisible();
  await found.getByRole("button", { name: "Restore them" }).click();
  await expect(title).toHaveValue(`Changed ${tag}`);
  await expect(found).toHaveCount(0);

  // Discarding the copy asks first, then it's gone for good.
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await found.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("dialog", { name: "Discard the unsaved changes?" }).getByRole("button", { name: "Discard changes" }).click();
  await expect(found).toHaveCount(0);
  await expect(title).toHaveValue(`Unsaved ${tag}`);
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(found).toHaveCount(0);

  // "Leave without saving" really leaves.
  await title.fill(`Changed again ${tag}`);
  await nav.getByRole("link", { name: "Gins" }).click();
  await leave.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/juniper\/gins$/);
  // ...and the edits it left behind are not offered again.
  await gotoReady(page, editUrl);
  await expect(found).toHaveCount(0);

  expect(popups).toEqual([]);
});
