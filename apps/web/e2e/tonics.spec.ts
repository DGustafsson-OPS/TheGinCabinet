// Tonics: a simple list (no stock) with reviews. Add a tonic and a review in
// the admin area, publish it, and check what visitors see.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("add a tonic, review and publish it; visitors see only what's published", async ({ page, browser, baseURL }) => {
  const tag = unique();
  const name = `Elderflower ${tag}`;

  await signInThroughUi(page);
  await gotoReady(page, "/juniper/tonics/new");
  await page.getByLabel("Brand").fill("Garden");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Style").selectOption("flavoured");
  await page.getByLabel("Country").fill("Finland");
  await page.getByLabel("Flavour notes").fill("elderflower, citrus");
  await page.getByLabel("Show this tonic on the public website").check();
  await page.getByRole("button", { name: "Add tonic" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Garden ${name}` })).toBeVisible();

  // Two reviews: one published, one left as a draft.
  await page.getByRole("button", { name: "Add a review" }).click();
  await expect(toasts(page)).toContainText("New draft review added");
  let review = page.getByRole("form", { name: /Review by/ }).first();
  // Publishing an empty review explains what's missing.
  await review.getByRole("button", { name: "Save and publish" }).click();
  await expect(review.getByRole("alert")).toContainText("Give a rating.");
  await review.getByLabel("Rating (0–10)").fill("8,5");
  await review.getByLabel("Tasting notes").fill("Floral and light, gentle quinine.");
  await review.getByLabel("Pairs well with").fill("Floral gins");
  await review.getByRole("button", { name: "Save and publish" }).click();
  await expect(toasts(page)).toContainText("Published");
  review = page.getByRole("form", { name: /Review by/ }).first();
  await expect(review.getByText(/^Published/)).toBeVisible();

  await page.getByRole("button", { name: "Add a review" }).click();
  const draft = page.getByRole("form", { name: /Review by/ }).nth(1);
  await draft.getByLabel("Tasting notes").fill(`Secret draft ${tag}`);
  await draft.getByRole("button", { name: "Save review" }).click();
  await expect(toasts(page)).toContainText("Review saved.");

  // A private tonic for comparison.
  const { api, csrf } = await signedInApi(baseURL!);
  const hidden = await (
    await api.post("/api/v1/admin/tonics", { headers: { "X-CSRF-Token": csrf }, data: { brand: "Hidden", name: `Tonic ${tag}` } })
  ).json();
  await api.dispose();

  // The visitor's view.
  const visitor = await browser.newPage();
  await gotoReady(visitor, `/tonics?search=${encodeURIComponent(tag)}`);
  await expect(visitor.getByRole("link", { name: `Garden ${name}` })).toBeVisible();
  await expect(visitor.getByText(`Hidden Tonic ${tag}`)).toHaveCount(0);
  await expect(visitor.getByText("8.5")).toBeVisible();
  await visitor.getByRole("link", { name: `Garden ${name}` }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: `Garden ${name}` })).toBeVisible();
  await expect(visitor.getByText("Floral and light, gentle quinine.")).toBeVisible();
  await expect(visitor.getByText("Floral gins")).toBeVisible();
  await expect(visitor.locator("main")).not.toContainText(`Secret draft ${tag}`);
  expect((await visitor.goto(`/tonics/${hidden.slug}`))?.status()).toBe(404);

  const sitemap = await (await visitor.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/tonics/garden-elderflower");
  expect(sitemap).not.toContain(`/tonics/${hidden.slug}`);
  await visitor.close();
});
