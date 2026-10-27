// End-to-end test of the Phase 3 editorial workflow (spec §6 "Publish review",
// §11 "A draft review returns 404 publicly", "publication and unpublication
// correctly updates listing and canonical pages").
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

// A valid 1×1 pixel PNG, so the test doesn't need an image file on disk.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("tasting → review → publish → withdraw", async ({ page, browser, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { brand: "Editorial", name: `Gin ${unique()}` });
  const coverName = `cover ${unique()}`; // the file name becomes the image's name
  const altText = `Bottle photo ${unique()}`;
  const title = `A meadow in a glass ${unique()}`;

  await signInThroughUi(page);

  // 1. Upload a cover image and describe it.
  await gotoReady(page, "/juniper/media");
  await page.locator("#upload-input").setInputFiles({ name: `${coverName.replace(" ", "_")}.png`, mimeType: "image/png", buffer: TINY_PNG });
  await expect(toasts(page)).toContainText("1 image uploaded");
  // Other tests upload too, so open this one by its name.
  await page.getByRole("link", { name: new RegExp(`^${coverName}.*No alt text`) }).click();
  await page.getByLabel("Alt text").fill(altText);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toasts(page)).toContainText("Saved.");

  // 2. A private tasting with flavour sliders.
  await gotoReady(page, `/juniper/tastings/new?gin=${gin.id}`);
  await page.getByLabel("Nose").fill("Meadowsweet and pine");
  await page.getByLabel(/^Juniper/).fill("4");
  await page.getByLabel("Overall rating (0–10)").fill("8.5");
  await page.getByRole("button", { name: "Save tasting" }).click();
  await expect(toasts(page)).toContainText("Tasting saved.");

  // 3. Start a review from it: the notes are copied in.
  await page.getByRole("link", { name: "Start a review from this" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByLabel("Nose")).toHaveValue("Meadowsweet and pine");
  await expect(page.getByLabel("Rating (0–10)")).toHaveValue("8.5");
  await page.getByLabel("Verdict").fill("Buy two bottles.");
  await page.getByLabel("Cover image").selectOption({ label: `${coverName} — ${altText}` }); // name — description
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");

  // A draft is invisible to the public.
  const visitor = await browser.newPage(); // a separate, signed-out browser
  const slug = new URL(page.url()).pathname; // /juniper/reviews/<id>
  const review = await (await api.get(`/api/v1${slug}`)).json();
  expect((await visitor.goto(`/reviews/${review.slug}`))?.status()).toBe(404);

  // 4. Ready → Publish is refused while the gin is private, with reasons.
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Ready to publish", { exact: true })).toBeVisible(); // the badge, not the "Marked ready…" toast
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Not ready to publish yet")).toBeVisible();
  await expect(page.getByText(/Make the gin public first/)).toBeVisible();

  // 5. Make the gin public, then publish.
  const ginNow = await (await api.get(`/api/v1/admin/gins/${gin.id}`)).json();
  await api.patch(`/api/v1/admin/gins/${gin.id}`, {
    headers: { "X-CSRF-Token": csrf },
    data: { version: ginNow.version, public_visible: true },
  });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Live on the site")).toBeVisible();

  // The visitor now finds it in the list and can read it.
  await gotoReady(visitor, "/reviews");
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(visitor.getByText("Buy two bottles.")).toBeVisible();
  await expect(visitor.getByRole("img", { name: altText })).toBeVisible();
  const jsonLd = await visitor.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd!).reviewRating.ratingValue).toBe("8.5");

  // 6. Withdraw: gone from the list and the page (spec §11).
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await gotoReady(visitor, "/reviews");
  await expect(visitor.getByRole("link", { name: title })).toHaveCount(0);
  expect((await visitor.goto(`/reviews/${review.slug}`))?.status()).toBe(404);

  // The history shows every step.
  await page.getByRole("link", { name: "Revision history" }).click();
  for (const step of ["Withdrawn to draft", "Published", "Marked ready", "Edited", "Created"]) {
    await expect(page.getByText(step, { exact: false }).first()).toBeVisible();
  }
  await visitor.close();
  await api.dispose();
});
