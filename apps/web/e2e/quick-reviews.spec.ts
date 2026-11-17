// Quick reviews: rate a gin with juniper berries in the admin area, then see
// it on the gin's page and in the gin's rating.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("give a gin a quick review, edit it, see it on the site, delete it", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { name: `Quickly ${tag}`, public_visible: true });
  await api.dispose();

  await signInThroughUi(page);
  // From the gin's admin page, the "Quick review" button opens the form on that gin.
  await gotoReady(page, `/juniper/gins/${gin.id}`);
  await page.getByRole("link", { name: "Quick review", exact: true }).click();
  const form = page.getByRole("form", { name: "Add a quick review" });
  await expect(form.getByLabel("Gin", { exact: true })).toHaveValue(gin.id);
  await form.getByLabel("Junipers", { exact: true }).fill("4.5");
  await expect(form.getByRole("img", { name: "4.5 out of 5 juniper berries" })).toBeVisible();
  await form.getByLabel("A line or two (optional)").fill(`Bright and easy ${tag}`);
  await form.getByRole("button", { name: "Save quick review" }).click();
  await expect(toasts(page)).toContainText("Saved: 4½ junipers");

  // Visitors see it on the gin's page, and the gin is rated 4½ berries.
  await gotoReady(page, `/gins/${gin.slug}`);
  const verdicts = page.getByRole("region", { name: "Quick verdicts" });
  await expect(verdicts).toContainText(`Bright and easy ${tag}`);
  await expect(verdicts.getByRole("img", { name: "4.5 out of 5 juniper berries" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Our rating" })).toContainText("4½");

  // Edit it down to 3 berries.
  await gotoReady(page, "/juniper/quick-reviews");
  await page.getByRole("button", { name: `Edit quick review of ${gin.display_name}` }).click();
  const edit = page.getByRole("form", { name: `Edit quick review of ${gin.display_name}` });
  await edit.getByLabel("Junipers", { exact: true }).fill("3");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toasts(page)).toContainText("Saved.");
  await gotoReady(page, `/gins/${gin.slug}`);
  await expect(page.getByRole("region", { name: "Quick verdicts" }).getByRole("img", { name: "3 out of 5 juniper berries" })).toBeVisible();

  // Delete it: the section goes.
  await gotoReady(page, "/juniper/quick-reviews");
  await page.getByRole("button", { name: `Delete quick review of ${gin.display_name}` }).click();
  await page.getByRole("button", { name: "Delete quick review", exact: true }).click();
  await expect(toasts(page)).toContainText("Quick review deleted.");
  await gotoReady(page, `/gins/${gin.slug}`);
  await expect(page.getByRole("region", { name: "Quick verdicts" })).toHaveCount(0);
});

test("give a tonic a quick review in tonic bottles", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const tonic = await (
    await api.post("/api/v1/admin/tonics", {
      headers: { "X-CSRF-Token": csrf },
      data: { brand: "Fizzwell", name: `Quick ${tag}`, public_visible: true },
    })
  ).json();
  await api.dispose();

  await signInThroughUi(page);
  // The tonic's admin page has the same "Quick review" button; the form opens on "A tonic".
  await gotoReady(page, `/juniper/tonics/${tonic.id}`);
  await page.getByRole("link", { name: "Quick review", exact: true }).click();
  const form = page.getByRole("form", { name: "Add a quick review" });
  await expect(form.getByRole("radio", { name: "A tonic (tonic bottles)" })).toBeChecked();
  await expect(form.getByLabel("Tonic", { exact: true })).toHaveValue(tonic.id);
  await form.getByLabel("Tonic bottles", { exact: true }).fill("4");
  await expect(form.getByRole("img", { name: "4 out of 5 tonic bottles" })).toBeVisible();
  await form.getByLabel("A line or two (optional)").fill(`Crisp and dry ${tag}`);
  await form.getByRole("button", { name: "Save quick review" }).click();
  await expect(toasts(page)).toContainText("Saved: 4 tonic bottles");

  // Visitors see it on the tonic's page, rated in tonic bottles.
  await gotoReady(page, `/tonics/${tonic.slug}`);
  const verdicts = page.getByRole("region", { name: "Quick verdicts" });
  await expect(verdicts).toContainText(`Crisp and dry ${tag}`);
  await expect(verdicts.getByRole("img", { name: "4 out of 5 tonic bottles" })).toBeVisible();

  // In the admin list it shows bottles too, and can be deleted.
  await gotoReady(page, "/juniper/quick-reviews");
  await page.getByRole("button", { name: `Delete quick review of ${tonic.display_name}` }).click();
  await page.getByRole("button", { name: "Delete quick review", exact: true }).click();
  await expect(toasts(page)).toContainText("Quick review deleted.");
  await gotoReady(page, `/tonics/${tonic.slug}`);
  await expect(page.getByRole("region", { name: "Quick verdicts" })).toHaveCount(0);
});
