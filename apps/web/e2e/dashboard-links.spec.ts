// Dashboard tiles are links: each opens the list behind its number, filtered.
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("each dashboard tile opens its list", async ({ page }) => {
  await signInThroughUi(page);
  const tiles: [string, RegExp, string][] = [
    ["Unique gins", /\/juniper\/gins$/, "Gins"],
    ["Bottles in the cabinet", /\/juniper\/bottles\?status=in_cabinet$/, "Bottles"],
    ["Open bottles", /\/juniper\/bottles\?status=open$/, "Bottles"],
    ["Inventory value", /\/juniper\/purchases$/, "Purchases"],
    ["Gins visible to the public", /\/juniper\/gins\?public=true$/, "Gins"],
    ["Wishlist (private)", /\/juniper\/wishlist$/, "Wishlist"],
  ];
  for (const [label, url, heading] of tiles) {
    await gotoReady(page, "/juniper");
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    // The bottles list arrives with its filter already chosen.
    if (label === "Open bottles") await expect(page.getByLabel("Status")).toHaveValue("open");
  }
});
