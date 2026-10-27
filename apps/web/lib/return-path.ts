// Where to send a visitor after a small form (age gate, cookie banner) has
// done its job: back to the page they were on.

/**
 * Only paths on this site are allowed ("/gins/x"); anything else
 * ("https://evil.example", "//evil.example") becomes "/". Without this check,
 * the forms could be abused to bounce people to another website (an "open
 * redirect").
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** The page the form was on, from the Referer header, if it's on this site. */
function refererPath(request: Request): string | null {
  try {
    const referer = new URL(request.headers.get("referer") ?? "");
    return referer.host === request.headers.get("host") ? referer.pathname + referer.search : null;
  } catch {
    return null; // missing or malformed header
  }
}

/**
 * The page to return to: the form's hidden "next" field (filled in by
 * ReturnPathInput), or without JavaScript the Referer header.
 */
export function returnPath(request: Request, form: FormData): string {
  return safeReturnPath(form.get("next")?.toString() || refererPath(request));
}

/** True when the visitor reached us over HTTPS (directly or via the proxy). */
export function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
