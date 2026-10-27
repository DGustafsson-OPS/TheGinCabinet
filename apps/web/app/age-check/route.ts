// Receives the age gate's answer (a plain HTML form POST, so it works even
// without JavaScript).
//   "yes" → remember it in a cookie, then go back to the page they came for.
//   "no"  → go to /age-restricted, which explains the site is 18+.
import { AGE_COOKIE, AGE_COOKIE_DAYS } from "@/lib/age-gate";
import { isHttps, returnPath } from "@/lib/return-path";

export async function POST(request: Request) {
  const form = await request.formData();
  const answer = form.get("answer");
  const next = returnPath(request, form); // the page they came for

  // 303 "See Other": after a form POST, the browser loads the new page with GET.
  if (answer !== "yes") {
    return new Response(null, { status: 303, headers: { Location: "/age-restricted" } });
  }
  const secure = isHttps(request);
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
