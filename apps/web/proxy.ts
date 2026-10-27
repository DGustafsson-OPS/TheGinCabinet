// Runs before every page request (Next.js 16 calls this file "proxy"; older
// versions called it "middleware"). Its one job: give the page a fresh nonce
// and the Content-Security-Policy header that names it. See lib/csp.ts.
import { type NextRequest, NextResponse } from "next/server";

import { gaMeasurementId } from "@/lib/consent";
import { buildCsp, newNonce } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    analytics: gaMeasurementId() !== null,
    turnstile: Boolean(process.env.TURNSTILE_SITE_KEY?.trim()),
  });

  // Next.js reads the nonce from the *request's* CSP header while rendering,
  // and stamps it on its own scripts. x-nonce is for our code (GoogleAnalytics).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // ...and the browser enforces the one on the *response*.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not /api (JSON from FastAPI), not Next's static files,
      // images or fonts, which never run scripts.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|images/).*)",
      // Skip link prefetches (the Next.js guide recommends this): they fetch
      // page data in the background, not a page the browser displays.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
