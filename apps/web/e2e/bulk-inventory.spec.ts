// Bulk work in the admin: make several gins public at once, add a bottle as
// sealed or opened straight from the gin list, and update many bottle levels
// on one page.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("make several gins public at once", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const first = await createGin(api, csrf, { brand: "Bulk", name: `One ${tag}` });
  const second = await createGin(api, csrf, { brand: "Bulk", name: `Two ${tag}` });
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, `/juniper/gins?search=${tag}`);
  await page.getByRole("checkbox", { name: `Select ${first.display_name}` }).check();
  await page.getByRole("checkbox", { name: `Select ${second.display_name}` }).check();
  await page.getByRole("group", { name: "With the 2 selected" }).getByRole("button", { name: "Make public" }).click();
  await expect(toasts(page)).toContainText("2 gins are now on the website.");
  // Both rows now show the "Public" badge.
  await expect(page.locator("tbody").getByText("Public", { exact: true })).toHaveCount(2);

  // Visitors see both.
  await gotoReady(page, `/collection?search=${tag}`);
  await expect(page.getByRole("link", { name: first.display_name })).toBeVisible();
  await expect(page.getByRole("link", { name: second.display_name })).toBeVisible();

  // And back to private with "Select all".
  await gotoReady(page, `/juniper/gins?search=${tag}`);
  await page.getByLabel("Select all on this page").check();
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(toasts(page)).toContainText("2 gins are now private.");
});

test("add a bottle as opened, then update levels for several bottles", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { brand: "Levels", name: `Gin ${tag}` });
  // A sealed 500 ml bottle to open on the levels page.
  const sealed = (await (await api.post("/api/v1/admin/bottles", { headers: { "X-CSRF-Token": csrf }, data: { gin_id: gin.id, size_ml: 500 } })).json())[0];
  await api.dispose();

  // From the gin list: "+ Add bottle" opens the form on this gin; choose "Opened".
  await signInThroughUi(page);
  await gotoReady(page, `/juniper/gins?search=${tag}`);
  await page.getByRole("link", { name: `+ Add bottle of ${gin.display_name}` }).click();
  await expect(page.getByLabel("Gin", { exact: true })).toHaveValue(gin.id);
  await page.getByRole("radio", { name: "Opened" }).check();
  await page.getByLabel("About how much is left (ml)").fill("600");
  await page.getByRole("button", { name: "Add bottles" }).click();
  await expect(toasts(page)).toContainText("Bottle added.");

  // The levels page lists both; change both and save once.
  await gotoReady(page, "/juniper/bottles");
  await page.getByRole("link", { name: "Update levels" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Update levels" })).toBeVisible();
  const opened = `${gin.display_name}, 700 ml`;
  const other = `${gin.display_name}, 500 ml`;
  await expect(page.getByLabel(`Millilitres left in ${opened}`)).toHaveValue("600");
  await page.getByLabel(`Millilitres left in ${opened}`).fill("250");
  await page.getByLabel(`State of ${other}`).selectOption({ label: "Opened" });
  await page.getByLabel(`Millilitres left in ${other}`).fill("480");
  await expect(page.getByText("2 bottles changed.")).toBeVisible();
  await page.getByRole("button", { name: "Save all changes" }).click();
  await expect(toasts(page)).toContainText("Saved: 2 bottles updated.");

  // After the reload the new levels are there, and the sealed bottle is open.
  await expect(page.getByText("No changes yet.")).toBeVisible();
  await expect(page.getByLabel(`Millilitres left in ${opened}`)).toHaveValue("250");
  await expect(page.getByLabel(`Millilitres left in ${other}`)).toHaveValue("480");
  await gotoReady(page, `/juniper/bottles/${sealed.id}`);
  await expect(page.getByText("Open · 480 ml")).toBeVisible();

  // Finish one: it leaves the list.
  await gotoReady(page, "/juniper/bottles/levels");
  await page.getByLabel(`State of ${other}`).selectOption({ label: "Finished" });
  await page.getByRole("button", { name: "Save all changes" }).click();
  await expect(toasts(page)).toContainText("Saved: 1 bottle updated.");
  await expect(page.getByLabel(`State of ${other}`)).toHaveCount(0);
});
