// Everything can be corrected after it's added: distilleries, purchases
// (details and line prices), wishlist items. And photos can be uploaded right
// inside the forms that use them.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("upload a photo while adding a gin", async ({ page }) => {
  const tag = unique();
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/gins/new");
  await page.getByLabel("Brand").fill("Photo");
  await page.getByLabel("Name", { exact: true }).fill(`Gin ${tag}`);
  await page.getByLabel("ABV (%)").fill("40");

  await page.getByText("Upload a new photo…").click();
  await page.getByLabel("Photo file").setInputFiles({ name: "bottle.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByLabel("Describe the photo").fill(`Bottle of Photo Gin ${tag}`);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(toasts(page)).toContainText("Photo uploaded and selected");
  await expect(page.getByText(`Main photo: bottle — Bottle of Photo Gin ${tag}`)).toBeVisible();

  await page.getByRole("button", { name: "Add gin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Photo Gin ${tag}` })).toBeVisible();
  await expect(page.getByText(`Main photo: bottle — Bottle of Photo Gin ${tag}`)).toBeVisible(); // saved with the gin
});

test("edit a distillery after adding it", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  await api.post("/api/v1/admin/distilleries", { headers: { "X-CSRF-Token": csrf }, data: { name: `Still ${tag}`, country: "Finland" } });
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, `/juniper/distilleries?search=${tag}`);
  await page.getByRole("link", { name: `Still ${tag}`, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Still ${tag}` })).toBeVisible();
  await page.getByLabel("Region").fill("Uusimaa");
  await page.getByLabel("Website").fill("https://example.com/still");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Distillery saved.");
  await page.reload();
  await expect(page.getByLabel("Region")).toHaveValue("Uusimaa");
  await expect(page.getByLabel("Website")).toHaveValue("https://example.com/still");
});

test("correct a purchase's shop and a line price", async ({ page, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf);
  const purchase = await (
    await api.post("/api/v1/admin/purchases", {
      headers: { "X-CSRF-Token": csrf },
      data: { purchased_on: "2026-10-01", retailer: "Typo Shop", currency: "EUR", lines: [{ gin_id: gin.id, size_ml: 700, quantity: 2, unit_price: "34.00" }] },
    })
  ).json();
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, `/juniper/purchases/${purchase.id}`);
  const form = page.getByRole("form", { name: "Edit purchase" });
  await form.getByLabel("Shop").fill("Alko");
  await form.getByLabel(/^Line 1:/).fill("34,90");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Purchase saved.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alko");
  await expect(page.locator("tfoot")).toContainText("69.80"); // 2 × 34.90
});

test("edit a wishlist item", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  await api.post("/api/v1/admin/wishlist", { headers: { "X-CSRF-Token": csrf }, data: { text: `Wish ${tag}`, priority: 3 } });
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, "/juniper/wishlist");
  await page.getByRole("link", { name: `Wish ${tag}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Wish ${tag}` })).toBeVisible();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.getByLabel("Priority").selectOption("1");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible(); // the change registered
  await page.getByLabel("Notes").fill("Ask at the airport shop.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Wishlist item saved.");
  await page.reload();
  await expect(page.getByLabel("Priority")).toHaveValue("1");
});

test("a gin's admin page shows its ratings, with shortcuts to rate it", async ({ page, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf);
  await api.post("/api/v1/admin/tastings", { headers: { "X-CSRF-Token": csrf }, data: { gin_id: gin.id, tasted_on: "2026-10-20", rating: "7.5" } });
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, `/juniper/gins/${gin.id}`);
  const ratings = page.getByRole("region", { name: "Ratings" });
  await expect(ratings).toContainText("No published reviews yet");
  await expect(ratings).toContainText("7.5/10 from 1 tasting");
  await expect(ratings.getByRole("link", { name: "Write a review" })).toHaveAttribute("href", `/juniper/reviews/new?gin=${gin.id}`);
});

test("add a new gin while recording a purchase", async ({ page }) => {
  const tag = unique();
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/purchases/new");
  await page.getByLabel("Shop").fill("Systembolaget");
  await page.getByLabel("Currency").fill("SEK");

  await page.getByText("Not in the list? Add a new gin…").click();
  await page.getByLabel("New gin: brand").fill("Quick");
  await page.getByLabel("New gin: name").fill(`Gin ${tag}`);
  await page.getByLabel("New gin: ABV (%)").fill("41,5"); // a decimal comma works
  await page.getByRole("button", { name: "Add gin", exact: true }).click();
  await expect(toasts(page)).toContainText(`Quick Gin ${tag} added to the catalogue and selected.`);
  await expect(page.getByLabel("Gin (line 1)").locator("option:checked")).toHaveText(`Quick Gin ${tag}`);

  await page.getByLabel("Price per bottle").fill("399");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(toasts(page)).toContainText("Purchase saved: 1 bottle added.");
  await expect(page.getByText(`Quick Gin ${tag}`).first()).toBeVisible();
});
