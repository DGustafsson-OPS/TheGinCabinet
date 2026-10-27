// End-to-end tests of the public website (spec §4 P01–P03, P08, §11:
// "Public pages disclose only explicitly approved gin profiles").
import { type APIRequestContext, expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signedInApi, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

// A valid 1×1 pixel PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function post(api: APIRequestContext, csrf: string, url: string, data: unknown) {
  const response = await api.post(url, { headers: { "X-CSRF-Token": csrf }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("the public site shows public gins with their reviews and cocktails, and nothing private", async ({ page, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const tag = unique();
  const country = `Testland ${tag}`;

  // Prepare: a distillery, a public gin with a photo and a bottle, a private gin.
  const distillery = await post(api, csrf, "/api/v1/admin/distilleries", {
    name: `Public Distillery ${tag}`,
    country,
    website: "https://distillery.example",
  });
  const photo = await (
    await api.post("/api/v1/admin/media", {
      headers: { "X-CSRF-Token": csrf },
      multipart: { file: { name: "bottle.png", mimeType: "image/png", buffer: TINY_PNG }, alt: `Bottle ${tag}` },
    })
  ).json();
  const gin = await createGin(api, csrf, {
    brand: "Visible",
    name: `Gin ${tag}`,
    country,
    public_visible: true,
    botanicals: ["juniper", `herb${tag}`],
    distillery_id: distillery.id,
    image_ids: [photo.id],
  });
  const secret = await createGin(api, csrf, { brand: "Secret", name: `Gin ${tag}`, country, public_visible: false });
  await post(api, csrf, "/api/v1/admin/purchases", {
    purchased_on: "2026-10-01", retailer: "Shop", currency: "SEK",
    lines: [{ gin_id: gin.id, size_ml: 700, unit_price: "777" }],
  });
  // A published review and a published cocktail for the public gin.
  let review = await post(api, csrf, "/api/v1/admin/reviews", {
    gin_id: gin.id, title: `Review ${tag}`, verdict: "Lovely.", rating: "8.5", intro: "Bright and piney.",
  });
  review = await post(api, csrf, `/api/v1/admin/reviews/${review.id}/status`, { version: review.version, status: "ready" });
  await post(api, csrf, `/api/v1/admin/reviews/${review.id}/status`, { version: review.version, status: "published" });
  const recipe = await post(api, csrf, "/api/v1/admin/cocktails", {
    title: `Cooler ${tag}`, ingredients: [{ name: "Gin", quantity: "50", unit: "ml" }],
    steps: [{ text: "Stir." }], gins: [{ gin_id: gin.id }],
  });
  await post(api, csrf, `/api/v1/admin/cocktails/${recipe.id}/publish`, { version: recipe.version, status: "published" });
  await api.dispose();

  // Home: numbers and the latest content.
  await gotoReady(page, "/");
  await expect(page.getByRole("region", { name: "The collection in numbers" })).toBeVisible();

  // Collection: filter by the test country with the real form.
  await gotoReady(page, "/collection");
  await page.getByLabel("Country").selectOption(country);
  await page.getByRole("button", { name: "Show gins" }).click();
  await expect(page).toHaveURL(/country=/);
  await expect(page.getByRole("link", { name: `Visible Gin ${tag}` })).toBeVisible();
  await expect(page.getByText(`Secret Gin ${tag}`)).toHaveCount(0); // private
  await expect(page.getByText("In the cabinet").first()).toBeVisible();
  // The filter chip removes the filter again.
  await page.getByRole("link", { name: new RegExp(`${country}.*remove this filter`) }).click();
  await expect(page).not.toHaveURL(/country=/);

  // Gin page.
  await gotoReady(page, `/gins/${gin.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: `Visible Gin ${tag}` })).toBeVisible();
  await expect(page.getByRole("img", { name: `Bottle ${tag}` })).toBeVisible();
  // The gin's own status comes first; related gins further down have badges too.
  await expect(page.getByText("In the cabinet", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: `Review ${tag}` })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Cooler ${tag}`) })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("777"); // the price stays private
  await expect(page.locator("main")).not.toContainText("SEK");
  // A botanical links to the collection filtered by it.
  await page.getByRole("link", { name: new RegExp(`herb${tag}`, "i") }).click();
  await expect(page).toHaveURL(/botanical=/);
  await expect(page.getByRole("link", { name: `Visible Gin ${tag}` })).toBeVisible();

  // The private gin doesn't exist publicly.
  expect((await page.goto(`/gins/${secret.slug}`))?.status()).toBe(404);

  // Distillery page with a clearly marked external link.
  await gotoReady(page, `/distilleries/${distillery.slug}`);
  const external = page.getByRole("link", { name: /Visit the distillery's website/ });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  await expect(page.getByRole("link", { name: `Visible Gin ${tag}` })).toBeVisible();

  // Sitemap and robots.
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/gins/${gin.slug}`);
  expect(sitemap).not.toContain(`/gins/${secret.slug}`);
  expect(sitemap).toContain(`/reviews/`);
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /login");
  // robots.txt is public: it must not reveal where the admin area is.
  expect(robots).not.toContain("/juniper");
  expect(robots).not.toContain("/admin");
});
