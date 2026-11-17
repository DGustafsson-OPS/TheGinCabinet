// A gin or tonic without a photo shows a drawn bottle with "Picture coming
// soon", on its card and on its own page, until a real photo is added.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signedInApi, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("gins and tonics without a photo show a placeholder picture", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { name: `Unpictured ${tag}`, public_visible: true });
  const tonic = await (
    await api.post("/api/v1/admin/tonics", {
      headers: { "X-CSRF-Token": csrf },
      data: { brand: "Unpictured", name: `Tonic ${tag}`, public_visible: true },
    })
  ).json();
  await api.dispose();

  // Each placeholder must really load (a broken picture has no width).
  const loaded = async (selector: string) => {
    const picture = page.locator(selector).first();
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  };

  await gotoReady(page, `/collection?search=${encodeURIComponent(tag)}`);
  await loaded('article img[src*="placeholder-gin.svg"]');
  await gotoReady(page, `/gins/${gin.slug}`);
  await loaded('main img[src*="placeholder-gin.svg"]');

  await gotoReady(page, `/tonics?search=${encodeURIComponent(tag)}`);
  await loaded('article img[src*="placeholder-tonic.svg"]');
  await gotoReady(page, `/tonics/${tonic.slug}`);
  await loaded('main img[src*="placeholder-tonic.svg"]');
});
