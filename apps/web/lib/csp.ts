// Content-Security-Policy (CSP): the browser's allow-list for this site.
//
// The main point is scripts. Every page gets a fresh random "nonce", and the
// browser only runs <script> tags carrying that nonce. Next.js adds it to its
// own scripts automatically (it reads the nonce from this header). If someone
// ever managed to sneak a <script> into a page, say through review text, it
// would not have the nonce, so the browser would refuse to run it.
//
// proxy.ts builds this header for every page request.

/** Google Analytics hosts, allowed only when GA is configured (see lib/consent.ts). */
const GOOGLE_ANALYTICS = [
  "https://*.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];

export type CspOptions = {
  nonce: string;
  /** `next dev` needs eval for its error overlay; production never does. */
  dev?: boolean;
  /** Allow Google Analytics to send page views (it still loads only after consent). */
  analytics?: boolean;
};

export function buildCsp({ nonce, dev = false, analytics = false }: CspOptions): string {
  const ga = analytics ? GOOGLE_ANALYTICS : [];
  const directives: Record<string, string[]> = {
    // Anything not listed below: only from this site.
    "default-src": ["'self'"],
    // Only scripts with this page's nonce. 'strict-dynamic' lets those scripts
    // load further scripts (Next.js page chunks, Google's gtag.js loader).
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Styles may be inline (React `style={...}` attributes need this). CSS
    // cannot run code, so this is the usual, accepted trade-off.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Our own images (uploads come through /api/media), plus GA's tracking pixel.
    "img-src": ["'self'", "data:", "blob:", ...ga],
    "font-src": ["'self'"],
    // Where the page's JavaScript may send requests: our own /api, plus GA.
    "connect-src": ["'self'", ...ga],
    // No plugins (Flash and friends), no <base> tricks, forms only post to us.
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Nobody may show this site inside their own page (clickjacking).
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** A fresh, unguessable nonce: 16 random bytes, base64-encoded. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
