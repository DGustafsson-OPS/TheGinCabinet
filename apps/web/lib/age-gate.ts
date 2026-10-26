// The age gate's rules in one place. Every public page asks "Are you 18 or
// older?" until the visitor confirms; the answer is remembered in a cookie.

/**
 * Minimum age for the site. Finland: 18 is the legal drinking age (buying
 * drinks over 22% at Alko needs 20, but 18 is the threshold for the site).
 */
export const MINIMUM_AGE = 18;

/** Cookie that remembers "yes, I'm old enough". Holds only "1": no personal data. */
export const AGE_COOKIE = "gc_age_ok";

/** How long the answer is remembered before the gate asks again. */
export const AGE_COOKIE_DAYS = 30;

/**
 * Where to send the visitor after answering. Only paths on this site are
 * allowed ("/gins/x"); anything else ("https://evil.example", "//evil.example")
 * becomes "/". Without this check, the gate could be abused to bounce people
 * to another website (an "open redirect").
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
