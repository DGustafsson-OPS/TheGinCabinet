// End-to-end tests of the Gin Journal (spec §10A): write an article in the
// block editor, preview, publish, read it as a visitor, schedule, and archive.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("write, preview and publish an article; visitors read it; then archive it", async ({ page, browser, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { brand: "Journal", name: `Gin ${tag}`, public_visible: true });
  const category = await (
    await api.post("/api/v1/admin/blog/categories", { headers: { "X-CSRF-Token": csrf }, data: { name: `Guides ${tag}` } })
  ).json();
  await api.dispose();
  const title = `Visiting the still ${tag}`;

  await signInThroughUi(page);
  await gotoReady(page, "/juniper/blog/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption(category.id);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Draft · not public")).toBeVisible();

  // Details tab.
  await page.getByLabel("Summary (standfirst)").fill("A dawn visit to a copper still.");
  await page.getByLabel("Tags").fill(`stills, trip${tag}`);

  // Article tab: a heading, a paragraph with a link, and an embedded gin card.
  await page.getByRole("tab", { name: "Article" }).click();
  await page.getByRole("button", { name: "+ Heading" }).click();
  await expect(page.getByLabel("Heading text")).toBeFocused(); // focus moves into the new block
  await page.getByLabel("Heading text").fill("Arriving at dawn");
  await page.getByRole("button", { name: "+ Paragraph" }).click();
  await page
    .getByRole("group", { name: "Paragraph (block 2)" })
    .getByLabel("Text")
    .fill("We met the [distiller](https://distillery.example) by the still.");
  await page.getByRole("button", { name: "+ Embedded card" }).click();
  await page.getByRole("group", { name: "Embedded card (block 3)" }).getByLabel("Gin", { exact: true }).selectOption(gin.id);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(toasts(page)).toContainText("Saved.");
  await expect(page.getByRole("tab", { name: "Article" })).toHaveAttribute("aria-selected", "true"); // stays on the tab
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  // Preview shows the article as the public page will.
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Arriving at dawn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "distiller", exact: true })).toHaveAttribute("href", "https://distillery.example");
  await expect(page.getByRole("link", { name: gin.display_name })).toBeVisible();
  await page.getByRole("link", { name: "← Back to the editor" }).click();

  // Not public yet.
  const visitor = await browser.newPage();
  const draftUrl = `/blog/visiting-the-still-${tag}`;
  expect((await visitor.goto(draftUrl))?.status()).toBe(404);

  // Publish (with confirmation).
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(toasts(page)).toContainText("Published");
  await expect(page.getByText("Live on the site")).toBeVisible();

  // The visitor sees it on the Journal, on its own page, in its category and tag pages.
  await gotoReady(visitor, "/blog");
  await expect(visitor.getByRole("link", { name: title }).first()).toBeVisible();
  await visitor.getByRole("link", { name: title }).first().click();
  await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(visitor.getByText("A dawn visit to a copper still.")).toBeVisible();
  await expect(visitor.getByRole("link", { name: gin.display_name }).first()).toBeVisible();
  await visitor.getByRole("link", { name: `#trip${tag}` }).click();
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText(`trip${tag}`);
  await expect(visitor.getByRole("link", { name: title })).toBeVisible();
  await gotoReady(visitor, `/blog/category/${category.slug}`);
  await expect(visitor.getByRole("link", { name: title })).toBeVisible();

  const rss = await (await visitor.request.get("/blog/rss.xml")).text();
  expect(rss).toContain(`<title>${title}</title>`);
  const sitemap = await (await visitor.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(draftUrl);

  // Archive from the list with the bulk action.
  await gotoReady(page, `/juniper/blog?search=${encodeURIComponent(tag)}`);
  await page.getByRole("checkbox", { name: `Select ${title}` }).check();
  await page.getByRole("button", { name: "Archive selected (1)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(toasts(page)).toContainText("Archived 1 article");
  await expect(page.getByText("Archived · not public")).toBeVisible();
  expect((await visitor.goto(draftUrl))?.status()).toBe(404);
  await visitor.close();
});

test("schedule an article for later: it stays private until then", async ({ page, baseURL }) => {
  const tag = unique();
  const { api, csrf } = await signedInApi(baseURL!);
  const post = await (
    await api.post("/api/v1/admin/blog", {
      headers: { "X-CSRF-Token": csrf },
      data: {
        title: `Coming soon ${tag}`,
        excerpt: "A preview of things to come.",
        body_blocks: [{ type: "paragraph", text: "Soon." }],
      },
    })
  ).json();
  await api.dispose();

  await signInThroughUi(page);
  await gotoReady(page, `/juniper/blog/${post.id}/edit`);
  await page.getByLabel("Publish automatically at").fill("2099-06-01T09:30");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
  await expect(toasts(page)).toContainText("Scheduled for");
  await expect(page.getByText(/Scheduled · not live until/)).toBeVisible();
  expect((await page.request.get(`/api/v1/public/blog/${post.slug}`)).status()).toBe(404);

  // Cancelling the schedule brings it back to draft.
  await page.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(page.getByText("Draft · not public")).toBeVisible();
});
