// Our own cookie-consent manager (EU rules: GDPR + ePrivacy).
//
// * Visitors choose per category; "necessary" is always on.
// * Nothing optional runs until they agree. Google's script isn't even loaded.
// * Each choice gets a random consent ID and is logged on the server as proof
//   (see apps/api/app/api/routes/consent.py), without any personal data.
// * Raising CONSENT_VERSION asks everyone again (do it when you add a category
//   or change what a category does).
import "server-only";

/** Bump this when the cookie policy changes: every visitor is asked again. */
export const CONSENT_VERSION = 1;

/** Cookie holding the visitor's choice (see `serializeConsent`). */
export const CONSENT_COOKIE = "gc_consent";

/** How long a choice is remembered (6 months, then we ask again). */
export const CONSENT_COOKIE_DAYS = 182;

export type CookieInfo = { name: string; purpose: string; lifetime: string; provider: string };
export type ConsentCategory = {
  key: "necessary" | "analytics";
  title: string;
  description: string;
  required: boolean; // true: always on, can't be switched off
  cookies: CookieInfo[];
};

/**
 * Every cookie the site can set, by category. This list is shown on the
 * Cookie settings page, so keep it in step with the code.
 * To add a category (e.g. "marketing"): add it here, handle it in the
 * layout, and raise CONSENT_VERSION.
 */
export const CONSENT_CATEGORIES: ConsentCategory[] = [
  {
    key: "necessary",
    title: "Necessary",
    description: "Needed for the site to work. They can't be switched off and are never used for tracking.",
    required: true,
    cookies: [
      { name: "gc_age_ok", purpose: "Remembers that you confirmed you are 18 or older.", lifetime: "30 days", provider: "This site" },
      { name: "gc_consent", purpose: "Remembers your cookie choices (and a random ID that proves them).", lifetime: "6 months", provider: "This site" },
      { name: "gc_session", purpose: "Keeps the site's two editors signed in. Never set for visitors.", lifetime: "Up to 12 hours", provider: "This site" },
    ],
  },
  {
    key: "analytics",
    title: "Analytics",
    description:
      "Google Analytics shows us which pages are read and how visitors find the site, so we can improve it. Not used for advertising.",
    required: false,
    cookies: [
      { name: "_ga", purpose: "Tells visits apart (a random number).", lifetime: "2 years", provider: "Google Analytics" },
      { name: "_ga_…", purpose: "Keeps track of the current visit.", lifetime: "2 years", provider: "Google Analytics" },
    ],
  },
];

export type Consent = { id: string; analytics: boolean };
export type ConsentAction = "accept_all" | "reject_all" | "custom";

/** The cookie's value: "v1.<random id>.analytics" or "v1.<random id>.none". */
export function serializeConsent(consent: Consent): string {
  return `v${CONSENT_VERSION}.${consent.id}.${consent.analytics ? "analytics" : "none"}`;
}

/**
 * Read the cookie. Returns `null` (= ask again) when it's missing, malformed
 * or from an older policy version.
 */
export function parseConsent(value: string | undefined): Consent | null {
  const match = /^v(\d+)\.([A-Za-z0-9_-]{16,64})\.(analytics|none)$/.exec(value ?? "");
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  return { id: match[2], analytics: match[3] === "analytics" };
}

/** A new random consent ID (shown to nobody; it only links cookie and log). */
export function newConsentId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/**
 * The Google Analytics 4 Measurement ID ("G-XXXXXXXXXX"), from the
 * GA_MEASUREMENT_ID environment variable. `null` when unset or malformed:
 * then there is no banner and no analytics at all.
 *
 * Read on the server at request time, so it can be changed in Coolify
 * without rebuilding the site.
 */
export function gaMeasurementId(): string | null {
  const id = process.env.GA_MEASUREMENT_ID?.trim();
  return id && /^G-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}
