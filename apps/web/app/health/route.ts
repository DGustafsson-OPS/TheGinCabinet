// Health check for Docker/Coolify (spec §10B: "/health endpoints").
// A Route Handler is a URL that returns data instead of a page.
export function GET() {
  return Response.json({ status: "ok" });
}
