// Content-Security-Policy (lib/csp.ts, proxy.ts): every page gets the header
// with a fresh nonce, Next.js's own scripts carry that nonce, and no page
// trips the policy (a violation would mean something on the site is blocked).
import { type Page, expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi } from "./helpers";

/** Record CSP violations the browser reports on this page. */
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction("reportCspViolation", (text: string) => violations.push(text));
  // Playwright's own init scripts are not subject to the page's CSP.
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { reportCspViolation: (t: string) => void }).reportCspViolation(
        `${event.violatedDirective} blocked ${event.blockedURI || "inline code"}`,
      );
    });
  });
  // Block Google so the tests never contact it (the request still has to pass the CSP first).
  await page.route(/google(tagmanager|-analytics)\.com/, (route) => route.abort());
  return violations;
}

const host = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").hostname;
const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

test("each page gets its own nonce, and Next.js's scripts carry it", async ({ page }) => {
  const first = await page.goto("/");
  const csp = first?.headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  const nonce = nonceOf(csp)!;

  // Every script on the page has the nonce (the browser hides the attribute's
  // value from page code, so read the property).
  const scripts = await page.locator("script:not([type='application/ld+json'])").evaluateAll((all) =>
    all.map((s) => (s as HTMLScriptElement).nonce),
  );
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((value) => value === nonce)).toBe(true);

  // A new request, a new nonce.
  const second = await page.goto("/");
  expect(nonceOf(second?.headers()["content-security-policy"])).not.toBe(nonce);
});

test("a script smuggled into a page's HTML is blocked", async ({ page }) => {
  // Pretend some review text got a <script> into the server's HTML. The
  // real CSP header is kept; only the page body is changed on the way.
  await page.route((url) => url.pathname === "/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</body>", "<script>window.injected = true</script></body>");
    await route.fulfill({ response, body: html });
  });
  await gotoReady(page, "/"); // the site's own scripts still run (React starts)
  expect(await page.evaluate(() => (window as unknown as { injected?: boolean }).injected)).toBeUndefined();
});

test("public pages, the 404 page and the age pages run without CSP violations", async ({ page }) => {
  const violations = await watchViolations(page);
  for (const url of ["/", "/collection", "/reviews", "/cocktails", "/tonics", "/blog", "/about", "/cookie-settings", "/no-such-page", "/age-restricted"]) {
    await gotoReady(page, url);
  }
  expect(violations).toEqual([]);
});

test("Google Analytics loads under the policy once accepted", async ({ page, context }) => {
  const violations = await watchViolations(page);
  await context.addCookies([
    { name: "gc_consent", value: "v1.e2ecspconsent000000000.analytics", domain: host, path: "/" },
  ]);
  const gtag = page.waitForRequest(/googletagmanager\.com\/gtag\/js/);
  await gotoReady(page, "/collection");
  await gtag; // the request was made, so the CSP allowed it
  expect(violations).toEqual([]);
});

test("the admin area runs without CSP violations", async ({ page }) => {
  test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");
  const violations = await watchViolations(page);
  await signInThroughUi(page);
  for (const url of ["/juniper/gins", "/juniper/reviews", "/juniper/blog", "/juniper/tonics", "/juniper/settings"]) {
    await gotoReady(page, url);
  }
  expect(violations).toEqual([]);
});
