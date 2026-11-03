// Cocktail variations: link two recipes in the editor; each recipe page shows
// the other under "Variations", but only once both are published.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("link a variation; it shows both ways once published", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const post = async (path: string, data: object) =>
    (await api.post(path, { headers: { "X-CSRF-Token": csrf }, data })).json();
  const recipe = (title: string) => ({
    title,
    method: "stir",
    ingredients: [{ name: "Gin", quantity: "30", unit: "ml" }],
    steps: [{ text: "Stir over ice and strain." }],
  });
  const negroni = await post("/api/v1/admin/cocktails", recipe(`Negroni ${tag}`));
  const boulevardier = await post("/api/v1/admin/cocktails", recipe(`Boulevardier ${tag}`));
  await post(`/api/v1/admin/cocktails/${negroni.id}/status`, { version: negroni.version, status: "published" });

  // Link the Boulevardier (still a draft) from the Negroni's Variations tab.
  await signInThroughUi(page);
  await gotoReady(page, `/juniper/cocktails/${negroni.id}`);
  await page.getByRole("tab", { name: /^Variations/ }).click();
  await page.getByRole("button", { name: "Add a cocktail" }).click();
  await page.getByLabel("Cocktail 1", { exact: true }).selectOption({ label: `Boulevardier ${tag} (draft)` });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");

  // While the Boulevardier is a draft, the Negroni shows no Variations section.
  await gotoReady(page, `/cocktails/${negroni.slug}`);
  await expect(page.getByRole("region", { name: "Variations" })).toHaveCount(0);

  // Published: each page links to the other.
  const fresh = await (await api.get(`/api/v1/admin/cocktails/${boulevardier.id}`)).json();
  await post(`/api/v1/admin/cocktails/${boulevardier.id}/status`, { version: fresh.version, status: "published" });
  await api.dispose();
  await gotoReady(page, `/cocktails/${negroni.slug}`);
  await page.getByRole("region", { name: "Variations" }).getByRole("link", { name: `Boulevardier ${tag}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Boulevardier ${tag}` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Variations" }).getByRole("link", { name: `Negroni ${tag}` })).toBeVisible();
});
