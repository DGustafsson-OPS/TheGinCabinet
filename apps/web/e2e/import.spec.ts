// End-to-end test for the gin CSV import page (spec §6 "Imports and export", §11).
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("import gins from CSV: preview, confirm, then duplicates are skipped", async ({ page }) => {
  await signInThroughUi(page);
  const name = `Import Gin ${unique()}`;
  // One good row and one with no ABV, which must be rejected.
  const csv = [
    "brand,name,edition,style,abv,country,distillery,botanicals,public_visible,description",
    `E2E,${name},,london_dry,42,Sweden,E2E Import Distillery ${unique()},juniper|coriander,no,`,
    `E2E,${name} without ABV,,london_dry,,Sweden,,,no,`,
  ].join("\n");
  const file = { name: "gins.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

  // The page is reachable from the gin list.
  await gotoReady(page, "/juniper/gins");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import gins" })).toBeVisible();

  // 1. Preview: nothing is saved yet.
  await page.getByLabel("CSV file").setInputFiles(file);
  await page.getByRole("button", { name: "Preview import" }).click();
  const preview = page.getByRole("region", { name: "Import preview" });
  await expect(preview).toContainText("1 would be added, 0 already in the catalogue, 1 rejected");
  await expect(preview.getByRole("row", { name: new RegExp(`E2E ${name}$`) })).toBeVisible();
  await expect(preview.getByRole("row", { name: /without ABV/ })).toContainText("abv");

  // 2. Confirm.
  await page.getByRole("button", { name: "Import 1 gin" }).click();
  await expect(toasts(page)).toContainText("1 gin imported.");
  await expect(page.getByRole("region", { name: "Import result" })).toContainText("1 added");

  // 3. The same file again: the gin is now a duplicate, so nothing would be added.
  await page.getByRole("button", { name: "Import another file" }).click();
  await page.getByLabel("CSV file").setInputFiles(file);
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText(
    "0 would be added, 1 already in the catalogue",
  );
  await expect(page.getByRole("button", { name: "Import 0 gins" })).toBeDisabled();

  // The imported gin is in the catalogue.
  await gotoReady(page, "/juniper/gins");
  await page.getByLabel("Search").fill(name);
  await expect(page.getByRole("link", { name: `E2E ${name}` })).toBeVisible();
});
