// Receives every cookie choice (plain form POSTs: works without JavaScript).
//   choice=accept_all → all categories on
//   choice=reject_all → only necessary
//   choice=custom     → per category, from the form's checkboxes
// Then: remember it in the gc_consent cookie, log it on the server as proof of
// consent, delete Google Analytics' cookies if analytics is off, and go back.
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_DAYS,
  CONSENT_VERSION,
  type ConsentAction,
  gaMeasurementId,
  newConsentId,
  parseConsent,
  serializeConsent,
} from "@/lib/consent";
import { isHttps, returnPath } from "@/lib/return-path";

const API_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean, domain?: string): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
    "HttpOnly", // only the server reads it
    ...(domain ? [`Domain=${domain}`] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Cookies that expire Google Analytics' own cookies (_ga and _ga_<id>).
 * GA sets them on the main domain (".example.com"), so we expire them both
 * there and on the exact host name.
 */
function deleteGaCookies(host: string, secure: boolean): string[] {
  const names = ["_ga"];
  const id = gaMeasurementId();
  if (id) names.push(`_ga_${id.slice(2)}`);
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  const domains = [undefined, `.${hostname}`, ...(parts.length > 2 ? [`.${parts.slice(-2).join(".")}`] : [])];
  return names.flatMap((name) =>
    domains.map((domain) => cookie(name, "", 0, secure, domain).replace("; HttpOnly", "")),
  );
}

/** Log the choice on the API (proof of consent). Never blocks the visitor. */
async function logConsent(consentId: string, action: ConsentAction, analytics: boolean): Promise<void> {
  try {
    await fetch(`${API_URL}/internal/consent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consent_id: consentId, policy_version: CONSENT_VERSION, action, analytics }),
      signal: AbortSignal.timeout(2000), // give up after 2 s rather than keep them waiting
    });
  } catch (error) {
    console.error("Could not record cookie consent", error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const choice = form.get("choice");
  const action: ConsentAction = choice === "accept_all" || choice === "reject_all" ? choice : "custom";
  const analytics = action === "accept_all" || (action === "custom" && form.get("analytics") === "on");

  // Keep the visitor's existing consent ID, so their records stay linked.
  const existing = /(?:^|;\s*)gc_consent=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const consentId = parseConsent(existing)?.id ?? newConsentId();
  await logConsent(consentId, action, analytics);

  const secure = isHttps(request);
  const headers = new Headers({ Location: returnPath(request, form) });
  headers.append(
    "Set-Cookie",
    cookie(CONSENT_COOKIE, serializeConsent({ id: consentId, analytics }), CONSENT_COOKIE_DAYS * 24 * 60 * 60, secure),
  );
  if (!analytics) {
    for (const c of deleteGaCookies(request.headers.get("host") ?? "", secure)) headers.append("Set-Cookie", c);
  }
  // 303 "See Other": after a form POST, load the page again with GET.
  return new Response(null, { status: 303, headers });
}
