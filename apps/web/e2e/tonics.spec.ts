// Tonics: a simple list (no stock) with reviews. Add a tonic and a review in
// the admin area, publish it, and check what visitors see.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

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

test("a gin review links to its tonic, and the tonic lists the review", async ({ page, baseURL }) => {
  const tag = unique();
  // Prepare a public gin, a public tonic and a published review through the API.
  const { api, csrf } = await signedInApi(baseURL!);
  const post = async (path: string, data: object) =>
    (await api.post(path, { headers: { "X-CSRF-Token": csrf }, data })).json();
  const tonic = await post("/api/v1/admin/tonics", { brand: "Linkwater", name: `Tonic ${tag}`, public_visible: true });
  const gin = await createGin(api, csrf, { name: `Paired ${tag}`, public_visible: true });
  let review = await post("/api/v1/admin/reviews", { gin_id: gin.id, title: `Paired review ${tag}`, verdict: "Lovely.", rating: "8" });
  review = await post(`/api/v1/admin/reviews/${review.id}/status`, { version: review.version, status: "ready" });
  await post(`/api/v1/admin/reviews/${review.id}/status`, { version: review.version, status: "published" });
  await api.dispose();

  // Pick the tonic in the review editor.
  await signInThroughUi(page);
  await gotoReady(page, `/juniper/reviews/${review.id}`);
  await page.getByLabel("Tonic from our list").selectOption({ label: tonic.display_name });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");

  // Visitors follow the link from the review to the tonic, and back again.
  await gotoReady(page, `/reviews/${review.slug}`);
  await page.getByRole("link", { name: tonic.display_name }).click();
  await expect(page.getByRole("heading", { level: 1, name: tonic.display_name })).toBeVisible();
  const gins = page.getByRole("region", { name: "Gins we pour it with" });
  await gins.getByRole("link", { name: gin.display_name }).click();
  await expect(page).toHaveURL(new RegExp(`/reviews/${review.slug}$`));
});
