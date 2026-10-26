// Cookie consent for Google Analytics (EU rules: GDPR + ePrivacy).
//
// Analytics may only run after the visitor actively agrees. Until then Google's
// script isn't even loaded. The choice is stored in a cookie; "Cookie settings"
// in the footer lets visitors change their mind.
import "server-only";

/** Cookie holding the visitor's choice: "analytics" (accepted) or "necessary" (rejected). */
export const CONSENT_COOKIE = "gc_consent";

/** How long a choice is remembered (6 months, then we ask again). */
export const CONSENT_COOKIE_DAYS = 182;

export type ConsentChoice = "analytics" | "necessary";

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
