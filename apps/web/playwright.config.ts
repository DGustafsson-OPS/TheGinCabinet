// Browser tests ("end-to-end"): a real Chromium clicks through the site while
// the real API and database run behind it. See e2e/README.md for how to run them.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one admin account, so run them one after another.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // Every test starts as a visitor who has already passed the age gate, so
    // tests reach the pages they're about. e2e/age-gate.spec.ts tests the gate
    // itself, starting without this cookie.
    storageState: {
      cookies: [
        { name: "gc_age_ok", value: "1", domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" },
      ],
      origins: [],
    },
    trace: "retain-on-failure", // a step-by-step recording when a test fails
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: point at an already-installed Chromium instead of downloading one.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
