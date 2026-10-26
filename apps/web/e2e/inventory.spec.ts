// End-to-end tests for the Phase 2 inventory screens (spec §5 A02–A04, A08,
// §6 workflows and §11 acceptance tests).
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, createGin, signInThroughUi, signedInApi, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("add a gin through the form", async ({ page }) => {
  await signInThroughUi(page);
  const name = `Form Gin ${unique()}`;

  await page.goto("/admin/gins/new");
  await page.getByLabel("Brand").fill("E2E");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("ABV (%)").fill("43,1"); // a decimal comma is accepted
  await page.getByLabel("Botanicals").fill("Juniper, coriander , juniper");
  await page.getByRole("button", { name: "Add gin" }).click();

  await expect(page.getByRole("heading", { level: 1, name: `E2E ${name}` })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("was added");
  await expect(page.getByLabel("ABV (%)")).toHaveValue("43.10");
  await expect(page.getByLabel("Botanicals")).toHaveValue("coriander, juniper");

  // It shows up in the searchable list.
  await page.goto("/admin/gins");
  await page.getByLabel("Search").fill(name);
  await expect(page.getByRole("link", { name: `E2E ${name}` })).toBeVisible();
});

test("two admins editing the same gin get a conflict screen, not a silent overwrite", async ({
  page,
  baseURL,
}) => {
  // Spec §11: "Concurrent edits trigger a meaningful 409 conflict flow".
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf, { country: "Sweden" });

  await signInThroughUi(page);
  await page.goto(`/admin/gins/${gin.id}`);
  await expect(page.getByLabel("Country")).toHaveValue("Sweden");

  // Meanwhile, the other admin saves a change...
  const other = await api.patch(`/api/v1/admin/gins/${gin.id}`, {
    headers: { "X-CSRF-Token": csrf },
    data: { version: gin.version, country: "Norway" },
  });
  expect(other.ok()).toBe(true);

  // ...and this admin, still looking at the old copy, saves theirs.
  await page.getByLabel("Country").fill("Denmark");
  await page.getByRole("button", { name: "Save changes" }).click();

  const panel = page.getByRole("alert").filter({ hasText: "Someone else saved this" });
  await expect(panel).toBeVisible();
  const row = panel.getByRole("row", { name: /Country/ });
  await expect(row).toContainText("Denmark"); // your version
  await expect(row).toContainText("Norway"); // the saved version

  // Overwriting takes a deliberate click.
  await panel.getByRole("button", { name: "Keep my version" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  const saved = await (await api.get(`/api/v1/admin/gins/${gin.id}`)).json();
  expect(saved.country).toBe("Denmark");
  await api.dispose();
});

test("record a purchase with a gift line, then follow a bottle through its life", async ({
  page,
  baseURL,
}) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf);
  await api.dispose();

  await signInThroughUi(page);
  await page.goto(`/admin/purchases/new?gin=${gin.id}`);
  await page.getByLabel("Shop").fill("E2E Bottle Shop");
  await page.getByLabel("Bottles on line 1").fill("2");
  await page.getByLabel("Price per bottle on line 1").fill("299,50");
  await page.getByRole("button", { name: "Add another line" }).click();
  await page.getByLabel("Gin (line 2)").selectOption(gin.id);
  await page.getByLabel("Size (ml) on line 2").fill("50");
  await expect(page.getByText("3 bottles · SEK 599.00")).toBeVisible(); // running total
  await page.getByRole("button", { name: "Save purchase" }).click();

  // The purchase page shows the total, with the gift excluded.
  await expect(page.getByRole("heading", { level: 1, name: /E2E Bottle Shop/ })).toBeVisible();
  await expect(page.locator("tfoot")).toContainText("SEK 599.00");
  await expect(page.getByText("1 bottle has no price")).toBeVisible();

  // The gin now has 3 bottles; open the first 700 ml one.
  await page.goto(`/admin/gins/${gin.id}`);
  await expect(page.getByRole("heading", { name: "Bottles (3 in the cabinet)" })).toBeVisible();
  await page.getByRole("row", { name: /700 ml/ }).first().getByRole("link").click();

  await page.getByRole("button", { name: "Open bottle" }).click();
  await expect(page.getByText("Open · 700 ml").first()).toBeVisible();

  await page.getByLabel("About how much is left (ml)").fill("400");
  await page.getByRole("button", { name: "Update level" }).click();
  await expect(page.getByText("Open · 400 ml").first()).toBeVisible();

  // Finishing it asks for confirmation (spec §2).
  await page.getByRole("button", { name: "Mark as empty" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark this bottle as empty?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Mark as empty" }).click();
  await expect(page.getByText(/left the cabinet/)).toBeVisible();

  // Every step is in the history (spec §11: history is preserved).
  const history = page.locator("ol").filter({ hasText: "Added to the cabinet" });
  await expect(history.locator("li")).toHaveCount(4);
  await expect(history).toContainText("Open → Empty");
  await expect(history).toContainText("Level updated to 400 ml");
});

test("turn a wishlist entry into a purchase", async ({ page, baseURL }) => {
  const { api, csrf } = await signedInApi(baseURL!);
  const gin = await createGin(api, csrf);
  await api.dispose();
  const note = `Ask for the gift box ${unique()}`;

  await signInThroughUi(page);
  await page.goto("/admin/wishlist");
  await page.getByLabel("Gin from the catalogue").selectOption(gin.id);
  await page.getByLabel("Target price").fill("350");
  await page.getByLabel("Notes").fill(note);
  await page.getByRole("button", { name: "Add to wishlist" }).click();
  await expect(page.getByRole("status")).toContainText("Added to the wishlist.");

  const row = page.getByRole("row").filter({ hasText: note });
  await row.getByRole("link", { name: "Bought it" }).click();
  await expect(page.getByText(`Your notes: ${note}`)).toBeVisible();
  await expect(page.getByLabel("Price per bottle on line 1")).toHaveValue("350.00"); // pre-filled
  await page.getByLabel("Shop").fill("Duty free");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Duty free/ })).toBeVisible();

  // The wish is kept, notes and all, under "Bought".
  await page.goto("/admin/wishlist?status=purchased");
  const bought = page.getByRole("row").filter({ hasText: note });
  await expect(bought.getByRole("link", { name: "View purchase" })).toBeVisible();
});
