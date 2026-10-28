// Corner marks: a watermark chosen at upload, the "AI-generated" label added on
// the image's page, and the watermark removed again for several images at once.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

// A valid 1×1 pixel PNG, so the test doesn't need an image file on disk.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("watermark at upload, AI label per image, bulk removal", async ({ page, request }) => {
  const tag = unique();
  await signInThroughUi(page);
  await gotoReady(page, `/juniper/media?folder=${encodeURIComponent(`Marks ${tag}`)}`);

  // Upload two images with the watermark ticked.
  await page.getByLabel("Add watermark (© bottom-right)").check();
  await page.locator("#upload-input").setInputFiles([
    { name: `one-${tag}.png`, mimeType: "image/png", buffer: TINY_PNG },
    { name: `two-${tag}.png`, mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(toasts(page)).toContainText("2 images uploaded");
  const tiles = page.getByRole("link", { name: new RegExp(`(one|two) ${tag}`) });
  await expect(tiles).toHaveCount(2);
  for (const tile of await tiles.all()) await expect(tile).toContainText("©");

  // Open one and add the AI label; the checkboxes show what's on.
  await page.getByRole("link", { name: new RegExp(`one ${tag}`) }).click();
  const watermark = page.getByLabel(/Watermark: "© site name"/);
  const ai = page.getByLabel(/AI-generated: "AI-generated" label/);
  await expect(watermark).toBeChecked();
  await expect(ai).not.toBeChecked();
  const before = await page.locator("main img").first().getAttribute("src");
  await ai.check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toasts(page)).toContainText("The website now shows the image with these marks");
  // A new marked copy is shown; the previous one is gone.
  await expect(page.locator("main img").first()).not.toHaveAttribute("src", before!);
  expect((await request.get(before!)).status()).toBe(404);

  // Back in the folder: remove the watermark from both at once.
  await gotoReady(page, `/juniper/media?folder=${encodeURIComponent(`Marks ${tag}`)}`);
  await page.getByLabel("Select all on this page").check();
  const bulk = page.getByRole("form", { name: "Change the selected images" });
  await bulk.getByLabel("With the 2 selected").selectOption("watermark_off");
  await bulk.getByRole("button", { name: "Apply" }).click();
  await expect(toasts(page)).toContainText("Watermark removed from 2 images.");
  for (const tile of await tiles.all()) await expect(tile).not.toContainText("©");
  // The AI label stays where it was set.
  await expect(page.getByRole("link", { name: new RegExp(`one ${tag}`) })).toContainText("AI");
});
