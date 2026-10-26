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
  await gotoReady(page, "/admin/cocktails/new");
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

  await page.getByRole("tab", { name: /Steps/ }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 1").fill("Fill a copa glass with ice.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2").fill("Pour 50 ml gin and top up with tonic.");

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
  await expect(visitor.getByText("Floral notes lift the tonic.")).toBeVisible();

  for (let i = 0; i < 3; i++) {
    await visitor.getByRole("link", { name: "One drink more" }).click();
  }
  await expect(visitor).toHaveURL(/servings=4/);
  await expect(visitor.getByText("4 drinks")).toBeVisible();
  await expect(ingredients.getByText("200 ml")).toBeVisible(); // 50 ml × 4
  await expect(ingredients.getByText("Top up")).toBeVisible(); // no number to scale
  await expect(ingredients.getByText("8", { exact: true })).toBeVisible(); // 2 lime wheels × 4
  // The method text is never rewritten (spec §11).
  await expect(visitor.getByText("Pour 50 ml gin and top up with tonic.")).toBeVisible();
  await visitor.close();
});
