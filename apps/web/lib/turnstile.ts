// Cloudflare Turnstile's *site key* (public; the secret key lives only in the
// API). Read at run time like GA_MEASUREMENT_ID, so changing it needs a
// restart, not a rebuild. The contact form appears only when the API has the
// secret key (site.contact_form) AND this site key is set.
import "server-only";

import type { PublicSite } from "@/lib/types";

export function turnstileSiteKey(): string | null {
  const key = process.env.TURNSTILE_SITE_KEY?.trim();
  return key && /^[0-9A-Za-z_-]{10,100}$/.test(key) ? key : null;
}

export function contactFormOn(site: PublicSite | null): boolean {
  return Boolean(site?.contact_form && turnstileSiteKey());
}
