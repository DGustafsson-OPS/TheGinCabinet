import type { NextConfig } from "next";

// Where the FastAPI service lives, as seen from this Next.js server.
// Locally: http://127.0.0.1:8000. In Docker/Coolify: http://api:8000 (the
// private Docker network). NOTE: rewrites are fixed when `next build` runs, so
// the Docker image receives this value as a build argument.
const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

const securityHeaders = [
  // Don't let browsers guess file types (blocks some content-type attacks).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never allow this site inside someone else's <iframe> (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Send only our domain, not full URLs, to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Produce a small self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,

  // The browser only ever talks to this site. Requests to /api/... are passed
  // on to FastAPI, so cookies and CSRF checks work on a single origin
  // (spec §10B: "proxy /api to the API service through the same origin").
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
