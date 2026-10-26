// Receives the cookie banner's answer (a plain form POST: works without JavaScript).
//   accept → remember "analytics": Google Analytics may load
//   reject → remember "necessary": no analytics; delete any GA cookies
//   reset  → forget the choice so the banner shows again ("Cookie settings")
import { CONSENT_COOKIE, CONSENT_COOKIE_DAYS, gaMeasurementId } from "@/lib/consent";
import { isHttps, returnPath } from "@/lib/return-path";

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean, domain?: string): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
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
  return names.flatMap((name) => domains.map((domain) => cookie(name, "", 0, secure, domain)));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const choice = form.get("choice");
  const next = returnPath(request, form);
  const secure = isHttps(request);
  const host = request.headers.get("host") ?? "";

  const headers = new Headers({ Location: next });
  const maxAge = CONSENT_COOKIE_DAYS * 24 * 60 * 60;
  if (choice === "accept") {
    headers.append("Set-Cookie", cookie(CONSENT_COOKIE, "analytics", maxAge, secure));
  } else if (choice === "reject") {
    headers.append("Set-Cookie", cookie(CONSENT_COOKIE, "necessary", maxAge, secure));
    for (const c of deleteGaCookies(host, secure)) headers.append("Set-Cookie", c);
  } else {
    // "reset": forget the choice, and stop analytics until they choose again.
    headers.append("Set-Cookie", cookie(CONSENT_COOKIE, "", 0, secure));
    for (const c of deleteGaCookies(host, secure)) headers.append("Set-Cookie", c);
  }
  // 303 "See Other": after a form POST, load the page again with GET.
  return new Response(null, { status: 303, headers });
}
