// Settings → API keys: create a key (shown once), use it for MCP through the
// website's own /api address, see it in the list, revoke it.
import { expect, request, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

const MCP_HEADERS = { Accept: "application/json, text/event-stream", "Content-Type": "application/json" };

test("create an API key, use it through MCP, then revoke it", async ({ page, baseURL }) => {
  const name = `Claude ${unique()}`;
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/settings");
  await page.getByRole("tab", { name: "API keys" }).click();
  const form = page.getByRole("form", { name: "Create an API key" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Works for").selectOption({ label: "30 days" });
  await form.getByRole("button", { name: "Create API key" }).click();

  // Shown once, with the MCP addresses ready to copy.
  await expect(page.getByText("Copy it now: it won't be shown again.")).toBeVisible();
  const key = await page.getByLabel("API key", { exact: true }).inputValue();
  expect(key).toMatch(/^gck_/);
  await expect(page.getByLabel("MCP address (key in the header)")).toHaveValue(`${baseURL}/api/v1/mcp`);

  // The key works through the website's /api forwarding, as Claude would use it.
  const bot = await request.newContext({ baseURL, extraHTTPHeaders: { ...MCP_HEADERS, Authorization: `Bearer ${key}` } });
  const listed = await bot.post("/api/v1/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
  expect(listed.status()).toBe(200);
  expect(JSON.stringify(await listed.json())).toContain("call_api");

  // In the list, without the key itself.
  await page.getByRole("button", { name: "Done, I've copied it" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(key.slice(0, 10));
  await expect(page.getByText(key)).toHaveCount(0);

  // Revoke: it stops working at once.
  await row.getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(toasts(page)).toContainText(`"${name}" revoked.`);
  const after = await bot.post("/api/v1/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
  expect(after.status()).toBe(401);
  await bot.dispose();
});
