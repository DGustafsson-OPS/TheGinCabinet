// Receives the age gate's answer (a plain HTML form POST, so it works even
// without JavaScript).
//   "yes" → remember it in a cookie, then go back to the page they came for.
//   "no"  → go to /age-restricted, which explains the site is 18+.
import { AGE_COOKIE, AGE_COOKIE_DAYS, safeReturnPath } from "@/lib/age-gate";

/** The page the form was on, from the Referer header, if it's on this site. */
function refererPath(request: Request): string | null {
  try {
    const referer = new URL(request.headers.get("referer") ?? "");
    return referer.host === request.headers.get("host") ? referer.pathname + referer.search : null;
  } catch {
    return null; // missing or malformed header
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const answer = form.get("answer");
  // The page they came for: from the form, or (without JavaScript) the Referer.
  const next = safeReturnPath(form.get("next")?.toString() || refererPath(request));

  // 303 "See Other": after a form POST, the browser loads the new page with GET.
  if (answer !== "yes") {
    return new Response(null, { status: 303, headers: { Location: "/age-restricted" } });
  }
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const cookie = [
    `${AGE_COOKIE}=1`,
    "Path=/",
    `Max-Age=${AGE_COOKIE_DAYS * 24 * 60 * 60}`,
    "SameSite=Lax",
    "HttpOnly", // JavaScript never needs to read it
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": cookie } });
}
