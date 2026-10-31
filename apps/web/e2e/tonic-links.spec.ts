// Tonics linked to cocktails and to gins: pick them in the admin editors, then
// follow the links on the public site in both directions.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("link a tonic to a cocktail and to a gin, and follow the links both ways", async ({ page, baseURL }) => {
  const tag = unique();
  // A public gin, a public tonic and a published cocktail, made through the API.
  const { api, csrf } = await signedInApi(baseURL!);
  const post = async (path: string, data: object) =>
    (await api.post(path, { headers: { "X-CSRF-Token": csrf }, data })).json();
  const gin = await createGin(api, csrf, { name: `Suited ${tag}`, public_visible: true });
  const tonic = await post("/api/v1/admin/tonics", { brand: "Crosslink", name: `Tonic ${tag}`, public_visible: true });
  const recipe = await post("/api/v1/admin/cocktails", {
    title: `Linked Highball ${tag}`,
    method: "build",
    ingredients: [
      { name: "Gin", quantity: "50", unit: "ml" },
      { name: "Tonic water", unit: "top up" },
    ],
    steps: [{ text: "Build over ice." }],
  });
  await post(`/api/v1/admin/cocktails/${recipe.id}/status`, { version: recipe.version, status: "published" });
  await api.dispose();

  await signInThroughUi(page);

  // 1. The cocktail editor: the Tonics tab.
  await gotoReady(page, `/juniper/cocktails/${recipe.id}`);
  await page.getByRole("tab", { name: /^Tonics/ }).click();
  await page.getByRole("button", { name: "Add a tonic" }).click();
  await page.getByLabel("Tonic 1", { exact: true }).selectOption({ label: tonic.display_name });
  await page.getByLabel(/^Note for tonic 1/).fill("Keeps it crisp");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");

  // 2. The tonic editor: "Gins it suits".
  await gotoReady(page, `/juniper/tonics/${tonic.id}`);
  const suits = page.getByRole("group", { name: "Gins it suits" });
  await suits.getByRole("button", { name: "Add a gin" }).click();
  await suits.getByLabel("Gin 1", { exact: true }).selectOption({ label: gin.display_name });
  await suits.getByLabel(/^Note for gin 1/).fill("Lets the juniper shine");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");
  // After the page reloads, the link is still there.
  await expect(page.getByRole("group", { name: "Gins it suits" }).getByLabel("Gin 1", { exact: true })).toHaveValue(gin.id);

  // 3. Visitors: cocktail → tonic → cocktail, and tonic → gin → tonic.
  await gotoReady(page, `/cocktails/${recipe.slug}`);
  await expect(page.getByText("Keeps it crisp")).toBeVisible();
  await page.getByRole("link", { name: tonic.display_name }).click();
  await expect(page.getByRole("heading", { level: 1, name: tonic.display_name })).toBeVisible();
  await expect(page.getByText("Lets the juniper shine")).toBeVisible();

  const cocktails = page.getByRole("region", { name: "Cocktails with this tonic" });
  await expect(cocktails.getByRole("link", { name: `Linked Highball ${tag}` })).toBeVisible();

  await page.getByRole("region", { name: "Gins it suits" }).getByRole("link", { name: gin.display_name }).click();
  await expect(page.getByRole("heading", { level: 1, name: gin.display_name })).toBeVisible();
  const tonics = page.getByRole("region", { name: "Tonics that suit it" });
  await expect(tonics).toContainText("Lets the juniper shine");
  await tonics.getByRole("link", { name: new RegExp(tonic.display_name) }).click();
  await expect(page.getByRole("heading", { level: 1, name: tonic.display_name })).toBeVisible();
});
