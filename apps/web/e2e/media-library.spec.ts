// Media library: upload into a folder, rename a set of images as a numbered
// series, move them into a subfolder, rename the folder, and see that an
// image still in use is not deleted.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("folders, series names and bulk changes", async ({ page }) => {
  const tag = unique();
  const folder = `Test ${tag}`;
  await signInThroughUi(page);

  // Start in a new (still empty) folder: uploads land in it.
  await gotoReady(page, `/juniper/media?folder=${encodeURIComponent(folder)}`);
  await expect(page.getByText(/No images in this folder/)).toBeVisible();
  await page.locator("#upload-input").setInputFiles([
    { name: "IMG_0001.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "IMG_0002.png", mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(toasts(page)).toContainText("2 images uploaded");
  // The upload names come from the file names.
  await expect(page.getByRole("checkbox", { name: "Select IMG 0001" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select IMG 0002" })).toBeVisible();

  // Rename both as a series.
  await page.getByLabel("Select all on this page").check();
  const bulk = page.getByRole("form", { name: "Change the selected images" });
  await bulk.getByLabel("With the 2 selected").selectOption("rename");
  await bulk.getByLabel("New name").fill(`Bottle ${tag}`);
  await bulk.getByRole("button", { name: "Apply" }).click();
  await expect(toasts(page)).toContainText("2 images renamed.");
  await expect(page.getByRole("checkbox", { name: `Select Bottle ${tag} 1` })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Select Bottle ${tag} 2` })).toBeVisible();

  // Move one into a subfolder; it shows up as a subfolder tile.
  await page.getByRole("checkbox", { name: `Select Bottle ${tag} 2` }).check();
  await bulk.getByLabel("With the 1 selected").selectOption("move"); // it remembers the last action
  await bulk.getByLabel("Folder").fill(`${folder}/Backs`);
  await bulk.getByRole("button", { name: "Apply" }).click();
  await expect(toasts(page)).toContainText(`1 image moved to ${folder}/Backs.`);
  await expect(page.getByRole("checkbox", { name: `Select Bottle ${tag} 2` })).toHaveCount(0);
  await page.getByRole("list", { name: "Subfolders" }).getByRole("link", { name: /Backs/ }).click();
  await expect(page.getByRole("checkbox", { name: `Select Bottle ${tag} 2` })).toBeVisible();

  // Rename the parent folder; the subfolder moves with it.
  await gotoReady(page, `/juniper/media?folder=${encodeURIComponent(folder)}`);
  await page.getByText("Rename or move this folder…").click();
  await page.getByLabel("New folder path").fill(`Renamed ${tag}`);
  await page.getByRole("button", { name: "Rename folder" }).click();
  await expect(toasts(page)).toContainText("Folder renamed; 2 images moved.");
  await expect(page).toHaveURL(new RegExp(`folder=Renamed`));
  const folders = page.getByRole("navigation", { name: "Folders" });
  await expect(folders.getByRole("link", { name: "Backs" })).toBeVisible();
  await expect(folders.getByRole("link", { name: folder, exact: true })).toHaveCount(0);

  // Delete both (from the "All images" view, found by search).
  await gotoReady(page, `/juniper/media?search=${encodeURIComponent(`Bottle ${tag}`)}`);
  await page.getByLabel("Select all on this page").check();
  await bulk.getByRole("button", { name: "Delete 2…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(toasts(page)).toContainText("2 images deleted.");
  await expect(page.getByText(/No images match/)).toBeVisible();
});
