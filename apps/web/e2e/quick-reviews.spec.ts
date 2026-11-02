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
  await expect(form.getByLabel("Gin")).toHaveValue(gin.id);
  await form.getByLabel("Junipers").fill("4.5");
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
  await edit.getByLabel("Junipers").fill("3");
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
