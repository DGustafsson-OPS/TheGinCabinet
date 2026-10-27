// The Gin guide: the starter drafts are there, a new page can be written,
// previewed, published, read by visitors, reordered, unpublished and deleted.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

// A valid 1×1 pixel PNG, so the test doesn't need an image file on disk.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("write, publish, reorder and remove a Gin guide page", async ({ page, browser }) => {
  const tag = unique();
  const title = `Glasses ${tag}`;
  await signInThroughUi(page);

  // The starter drafts from the database migration are waiting, unpublished.
  await gotoReady(page, "/juniper/guide");
  await expect(page.getByRole("row", { name: /Gin styles explained.*Draft/ })).toBeVisible();

  // Add a page: it opens in the editor.
  await page.getByLabel("New page title").fill(title);
  await page.getByRole("button", { name: "Add page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Draft (not on the website)")).toBeVisible();

  // Text: a heading and a paragraph with bold, italic and a link.
  await page.getByRole("button", { name: "+ Heading" }).click();
  await page.getByLabel("Heading text").fill("The copa");
  await page.getByRole("button", { name: "+ Paragraph" }).click();
  await page
    .getByRole("group", { name: "Paragraph (block 2)" })
    .getByLabel("Text")
    .fill("A **big bowl** for *aromatic* gins. See [our collection](/collection).");
  // A photo beside the text, uploaded right here.
  await page.getByRole("button", { name: "+ Image" }).click();
  const photo = page.getByRole("group", { name: "Image (block 3)" });
  await photo.getByText("Upload a new photo…").click();
  await photo.getByLabel("Photo file").setInputFiles({ name: `copa-${tag}.png`, mimeType: "image/png", buffer: TINY_PNG });
  await photo.getByLabel("Describe the photo").fill(`A copa glass ${tag}`);
  await photo.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(toasts(page)).toContainText("Photo uploaded and selected");
  await photo.getByLabel("Placement").selectOption("right");
  // Title and summary.
  await page.getByRole("tab", { name: "Title and summary" }).click();
  await page.getByRole("textbox", { name: "Summary", exact: true }).fill("Which glass for which gin drink.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toasts(page)).toContainText("Saved.");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  // Preview shows it as the website will.
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "The copa" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "big bowl" })).toBeVisible();
  await expect(page.locator("em", { hasText: "aromatic" })).toBeVisible();
  // The photo sits on the right beside the text; on a phone it goes full width.
  const figure = page.locator("figure", { has: page.getByRole("img", { name: `A copa glass ${tag}` }) });
  await expect(figure).toHaveCSS("float", "right");
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(figure).toHaveCSS("float", "none");
  await page.setViewportSize(desktop);
  await page.getByRole("link", { name: "← Back to the editor" }).click();

  // Not public yet.
  const visitor = await browser.newPage();
  const slug = `/guide/glasses-${tag}`;
  expect((await visitor.goto(slug))?.status()).toBe(404);

  // Publish (with confirmation); visitors find it from the menu and the guide page.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expect(toasts(page)).toContainText("Published");
  await gotoReady(visitor, "/");
  await visitor.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Gin guide" }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Gin guide" })).toBeVisible();
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(visitor.getByText("Which glass for which gin drink.")).toBeVisible();
  await expect(visitor.getByRole("link", { name: "our collection" })).toHaveAttribute("href", "/collection");

  // Reorder: move it up one place in the list.
  await gotoReady(page, "/juniper/guide");
  const rows = page.getByRole("row");
  const before = await rows.allTextContents();
  const position = before.findIndex((row) => row.includes(title));
  await page.getByRole("button", { name: `Move ${title} up` }).click();
  await expect(toasts(page)).toContainText(`"${title}" moved up.`);
  await expect(rows.nth(position - 1)).toContainText(title);

  // Unpublish: gone from the website.
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
  await expect(toasts(page)).toContainText("Unpublished");
  expect((await visitor.goto(slug))?.status()).toBe(404);

  // Delete (with confirmation).
  await page.getByRole("button", { name: "Delete page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(toasts(page)).toContainText(`"${title}" deleted.`);
  await expect(page).toHaveURL(/\/juniper\/guide$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});
