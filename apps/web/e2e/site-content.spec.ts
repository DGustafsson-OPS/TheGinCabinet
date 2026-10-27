// Page texts and the contact form.
//
// The test servers use Cloudflare Turnstile's public *test* keys: the site
// key always shows the widget, and the secret key always FAILS the check on
// the server. Here the widget itself is replaced by a stand-in (so the test
// never loads anything from Cloudflare), and we check that a message whose
// check fails is refused and never stored. The success path is covered by
// the API's tests (apps/api/tests/test_site_content.py).
import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, signedInApi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");

test("change the home page intro in Page texts, see it live, then reset it", async ({ page, browser }) => {
  const words = `Gins, reviews and cocktails from two husbands (${unique()}).`;
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/pages");
  const intro = page.getByRole("form", { name: "Introduction under the title" });
  await expect(intro.getByText("the default text")).toBeVisible();
  await intro.getByLabel("Introduction under the title").fill(words);
  await intro.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toasts(page)).toContainText("Saved: Introduction under the title.");

  const visitor = await browser.newPage();
  await gotoReady(visitor, "/");
  await expect(visitor.getByText(words)).toBeVisible();

  // Formatted texts: headings and lists show in the preview.
  const body = page.getByRole("form", { name: "Main text" });
  await body.getByText("Preview").click();
  await expect(body.getByRole("heading", { name: "How we taste" })).toBeVisible();

  // Reset to the default asks first, in the page.
  const restored = page.getByRole("form", { name: "Introduction under the title" });
  await restored.getByRole("button", { name: "Reset to default" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset to default" }).click();
  await expect(toasts(page)).toContainText("Back to the default");
  await gotoReady(visitor, "/");
  await expect(visitor.getByText(words)).toHaveCount(0);
  await visitor.close();
});

test("the contact form refuses a message when the Turnstile check fails", async ({ page, baseURL }) => {
  // Stand-in for Cloudflare's script: draws nothing, hands over a dummy token.
  await page.route(/challenges\.cloudflare\.com\/turnstile/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, options) { el.textContent = "(Turnstile stand-in)"; setTimeout(() => options.callback("XXXX.DUMMY.TOKEN.XXXX")); return "w1"; },
        reset() {}, remove() {},
      };`,
    }),
  );
  const tag = unique();
  await gotoReady(page, "/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Contact" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contact" })).toBeVisible();
  await expect(page.getByText("(Turnstile stand-in)")).toBeVisible();

  const form = page.getByRole("form", { name: "Contact form" });
  await form.getByLabel("Your name").fill(`Visitor ${tag}`);
  await form.getByLabel("Your email").fill("visitor@example.com");
  await form.getByLabel("Message").fill("Hello from the test.");
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(form.getByRole("alert")).toContainText("couldn't confirm you're not a robot");

  // Nothing was stored.
  const { api } = await signedInApi(baseURL!);
  const messages = await (await api.get("/api/v1/admin/messages")).json();
  expect(JSON.stringify(messages)).not.toContain(`Visitor ${tag}`);
  await api.dispose();
});

test("the contact page allows Turnstile's frame in its security policy", async ({ page }) => {
  const response = await page.goto("/contact");
  expect(response?.headers()["content-security-policy"]).toContain("frame-src https://challenges.cloudflare.com");
});

test("admins see the Messages inbox", async ({ page }) => {
  await signInThroughUi(page);
  await gotoReady(page, "/juniper/messages");
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
});
