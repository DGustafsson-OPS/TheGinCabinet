// AVIF images: upload one in the media library, see it on a gin's page, and
// check that link previews fall back to the site's default share picture
// (Facebook, LinkedIn and others don't show AVIF in previews yet).
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

// A 32 × 24 brass-coloured AVIF picture (made with Pillow).
const TINY_AVIF = Buffer.from(
  "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKQAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAIAAAABgAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMW1kYXQSAAoJGBE/dogIaDQgMhoXh4eGIYSSSSZQAAAARc87veyix7LzW9sK6A==",
  "base64",
);

test("upload an AVIF image and show it on a gin's page", async ({ page, baseURL }) => {
  const tag = unique();
  const folder = `AVIF ${tag}`;

  // Upload through the media library, like a person would.
  await signInThroughUi(page);
  await gotoReady(page, `/juniper/media?folder=${encodeURIComponent(folder)}`);
  await page.locator("#upload-input").setInputFiles([{ name: `bottle-${tag}.avif`, mimeType: "image/avif", buffer: TINY_AVIF }]);
  await expect(toasts(page)).toContainText("1 image uploaded");

  // Put it on a public gin.
  const { api, csrf } = await signedInApi(baseURL!);
  const media = await (await api.get(`/api/v1/admin/media?folder=${encodeURIComponent(folder)}`)).json();
  const photo = media.items[0];
  expect(photo.mime).toBe("image/avif");
  const gin = await createGin(api, csrf, { name: `Avif ${tag}`, public_visible: true, image_ids: [photo.id] });
  await api.dispose();

  // The browser shows it (a picture that failed to load has no width).
  await gotoReady(page, `/gins/${gin.slug}`);
  const picture = page.locator(`img[src*="${photo.url}"]`).first();
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32);

  // Link previews use the default share picture instead of the AVIF.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image\.png$/);
});
