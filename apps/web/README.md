# apps/web: Next.js frontend (not started)

Will contain the public website, the Gin Journal blog and the admin UI
(spec §2–§5, §10A). It talks to the API through the same origin: the reverse
proxy routes `/api/*` to `apps/api`.

Calling the API from the browser:

1. `GET /api/v1/auth/session` → read `csrf_token`.
2. Send `credentials: "include"` on every `fetch` so the session cookie is sent.
3. Add the header `X-CSRF-Token: <csrf_token>` on every POST/PATCH/DELETE.
