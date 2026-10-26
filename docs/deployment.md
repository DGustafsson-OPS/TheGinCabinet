# Deployment (Coolify)

How the pieces fit together in production (spec §10, §10B). Everything here
also works with plain Docker Compose (`infra/docker-compose.yml`).

## Topology

```
Internet ──HTTPS──▶ Coolify proxy ──▶ web (Next.js :3000) ──/api──▶ api (FastAPI :8000) ──▶ PostgreSQL
                    (TLS, domain)       public                       private network        private
```

* **Only `web` is public.** The API and the database have no public port. The
  browser reaches the API through the website's `/api/...` path.
* Images are built from this repository: `apps/web/Dockerfile` and
  `apps/api/Dockerfile`.
* Migrations run as a one-off job (`alembic upgrade head`) before the new API
  version takes traffic (spec §10B step 4).

## Coolify setup (summary)

1. Create project **the-gin-cabinet**, environment **production**.
2. Add a **PostgreSQL** resource. Don't make it public. Set up its backup schedule.
3. Add the **api** service: Dockerfile build in `apps/api`, health check `/health`
   on port 8000, no domain. Environment (as Coolify secrets):
   `GC_DATABASE_URL`, `GC_SECRET_KEY`, `GC_ALLOWED_ORIGINS=https://your-domain`,
   `FORWARDED_ALLOW_IPS` (see below). `GC_COOKIE_SECURE` and
   `GC_ENVIRONMENT=production` are already the image defaults. Mount a
   persistent volume at `/app/media`.
4. Add the **web** service: Dockerfile build in `apps/web` with build argument
   `API_INTERNAL_URL=http://<api service name>:8000`, health check `/health`
   on port 3000, and your public domain with HTTPS. Runtime variable:
   `SITE_URL=https://your-domain` (canonical links and social previews).
5. Pre-deployment command for the api: `alembic upgrade head`.
6. Create the two admins from the api container's terminal:
   `python -m app.cli create-admin --username ... --email ... --display-name ...`
   Each admin scans their MFA key into an authenticator app and stores the
   recovery codes safely.

Scheduled Journal articles are published by a timer inside the api service
(every minute), so no extra cron job is needed.

> ⚠️ Back up `GC_SECRET_KEY`. It encrypts the stored MFA secrets; if it is
> lost, every admin needs `python -m app.cli reset-mfa`.

## Real client IP (spec §10B "verify real-client-IP trust boundaries")

The API slows down password guessing per username **and** per IP address, so it
needs the visitor's real IP. The chain is:

1. Coolify's proxy receives the visitor and **appends** their IP to the
   `X-Forwarded-For` header.
2. Next.js passes that header on to the API unchanged. (Tested: Next.js does
   not add an IP itself, and passes along whatever arrives.)
3. Uvicorn reads `X-Forwarded-For` **from right to left**, skipping senders
   listed in `FORWARDED_ALLOW_IPS`, and uses the first address that isn't one
   of them.

So set `FORWARDED_ALLOW_IPS` to the private Docker network range only (default
in `.env.example`: `172.16.0.0/12`). The right-most entry is then the one
written by Coolify's proxy, which a visitor cannot fake. **Never use `*`**:
uvicorn would then believe the left-most entry, which the visitor controls.

If Cloudflare proxying is enabled in front of Coolify, Cloudflare's own address
becomes the right-most entry. In that case configure the Coolify proxy to
restore the client IP from Cloudflare's `CF-Connecting-IP` header, and use
Full (strict) TLS (spec §10B).

## Checks before going live

- [ ] `https://your-domain/health` → `{"status":"ok"}`
- [ ] `https://your-domain/api/v1/auth/session` → `{"authenticated":false,...}`
- [ ] The API and database ports are **not** reachable from the Internet
- [ ] Sign in works with password + MFA for both admins
- [ ] Database and media backups run, and a test restore has succeeded (spec §11)
