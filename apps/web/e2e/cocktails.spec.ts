// End-to-end test of Phase 4: the recipe editor (spec A07) and the public
// library with the serving stepper (P06/P07, §11 scaling acceptance test).
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("build a recipe in the tabbed editor, publish it, scale it as a visitor", async ({ page, browser, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { brand: "Pairing", name: `Gin ${unique()}`, public_visible: true });
  await api.dispose();
  const title = `Garden Tonic ${unique()}`;

  await signInThroughUi(page);
  await gotoReady(page, "/juniper/cocktails/new");
  await page.getByLabel("Name").fill(title);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // Basics tab.
  await page.getByLabel("Garnish", { exact: true }).fill("lime wheels");
  await page.getByLabel("Garnish amount (scales with servings)").fill("2");
  await page.getByLabel("Preparation time (minutes)").fill("3");

  // The tabs work with the keyboard: Right arrow moves to "Ingredients".
  await page.getByRole("tab", { name: "Basics" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Ingredients/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Ingredient 1", { exact: true }).fill("Gin");
  await page.getByLabel("Amount of ingredient 1").fill("50");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Ingredient 2", { exact: true }).fill("Tonic water");
  await page.getByLabel("Unit of ingredient 2").selectOption("top up");
  // No unit: "3 strawberries".
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Ingredient 3", { exact: true }).fill("Strawberries");
  await page.getByLabel("Amount of ingredient 3").fill("3");
  await page.getByLabel("Unit of ingredient 3").selectOption({ label: "(no unit)" });

  await page.getByRole("tab", { name: /Steps/ }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 1", { exact: true }).fill("Fill a copa glass with ice.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2", { exact: true }).fill("Pour 50 ml gin and top up with tonic.");

  await page.getByRole("tab", { name: /Gin pairings/ }).click();
  await page.getByRole("button", { name: "Add recommended gin" }).click();
  await page.getByLabel("Recommended gin 1").selectOption(gin.id);
  await page.getByLabel("Why it works (gin 1)").fill("Floral notes lift the tonic.");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");
  // Saving keeps you where you were.
  await expect(page.getByRole("tab", { name: /Gin pairings/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  // Publish.
  await page.getByRole("tab", { name: "Publishing" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(toasts(page)).toContainText("Published");

  // A signed-out visitor finds it and scales it.
  const visitor = await browser.newPage();
  await gotoReady(visitor, "/cocktails");
  await visitor.getByRole("link", { name: title }).click();
  // A <section> labelled by its heading is a named "region" for screen readers.
  const ingredients = visitor.getByRole("region", { name: "Ingredients" });
  await expect(ingredients.getByText("50 ml")).toBeVisible();
  await expect(ingredients.getByRole("listitem").filter({ hasText: "Strawberries" })).toHaveText(/^3\s*Strawberries$/);
  await expect(visitor.getByText("Floral notes lift the tonic.")).toBeVisible();

  // Each click loads a new page; wait for it before clicking again, or the
  // second click can land on the old link (which still says servings=3).
  for (const servings of [2, 3, 4]) {
    await visitor.getByRole("link", { name: "One drink more" }).click();
    await expect(visitor).toHaveURL(new RegExp(`servings=${servings}$`));
    await expect(visitor.getByText(`${servings} drinks`)).toBeVisible();
  }
  await expect(visitor.getByText("4 drinks")).toBeVisible();
  await expect(ingredients.getByText("200 ml")).toBeVisible(); // 50 ml × 4
  await expect(ingredients.getByText("Top up")).toBeVisible(); // no number to scale
  await expect(ingredients.getByRole("listitem").filter({ hasText: "Strawberries" })).toHaveText(/^12\s*Strawberries$/); // 3 × 4, no unit
  await expect(ingredients.getByText("8", { exact: true })).toBeVisible(); // 2 lime wheels × 4
  // The method text is never rewritten (spec §11).
  await expect(visitor.getByText("Pour 50 ml gin and top up with tonic.")).toBeVisible();
  await visitor.close();
});
