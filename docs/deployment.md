# Hosting The Gin Cabinet on Coolify

Everything needed to run the site in production on [Coolify](https://coolify.io)
(spec §10B): what to buy or sign up for, every setting and secret, the first
deployment, updates and rollbacks, backups and restores, and monitoring.

The same images also run with plain Docker Compose (`infra/docker-compose.yml`)
if you ever need to move off Coolify.

> Coolify's screens change between versions. Where this guide names a menu or
> field, look for the closest equivalent in your version.

---

## 1. What you need

| Need | What and why | Rough cost |
| --- | --- | --- |
| **A server (VPS)** | One Linux server for Coolify, the site and the database. See [§3](#3-the-server). | ~€8–20 / month |
| **A domain name** | e.g. `gincabinet.example.com`. You need to be able to edit its DNS. | ~€10–15 / year |
| **Coolify** | Installed on the server (free, self-hosted). | free |
| **Access to this GitHub repository** | Coolify builds the site from Git. A private repo needs the Coolify GitHub App. | free |
| **Off-site backup storage** | Any S3-compatible bucket (Backblaze B2, Cloudflare R2, Hetzner Object Storage, AWS S3…) in a *different* place from the server. Holds the database and photo backups. | ~€1–5 / month |
| **A password manager** | For the secrets in [§4](#4-secrets-and-settings) and the admins' recovery codes. | — |
| **An authenticator app on each admin's phone** | Sign-in needs a 6-digit code (1Password, Google Authenticator, Authy…). | free |
| **An uptime monitor** (recommended) | Something outside your server that alerts you when the site is down (UptimeRobot, Better Stack, Healthchecks.io…). | free tier |

Nothing else is required: the site sends no email and needs no outside API
or CDN.

## 2. How the pieces fit together

```
Visitor ──HTTPS──▶ Coolify proxy ──▶ web (Next.js :3000) ──/api/…──▶ api (FastAPI :8000) ──▶ PostgreSQL 16
                   (TLS certificate,    public                       private                  private
                    your domain)                                     + photos volume           + backups → S3
```

* **Only `web` is public.** The API and the database have no public port or
  domain. Browsers reach the API through the website's own `/api/…` path, so
  everything is one origin (one domain, one certificate, simpler security).
* **Two applications from one repository:** `apps/web/Dockerfile` and
  `apps/api/Dockerfile`, plus a Coolify **PostgreSQL** database.
* **Uploaded photos** live on a persistent volume mounted at `/app/media` in
  the API container. They are *not* in the database, so they need their own backup.
* **Database migrations** run automatically when the API container starts,
  before it reports healthy (see [§6](#6-updates-and-rollbacks)).
* **Scheduled Journal articles** are published by a timer inside the API
  (every minute). No cron job is needed.

## 3. The server

**Size** (spec §10B starting guidance, which covers Coolify itself too):

| | Minimum | Comfortable |
| --- | --- | --- |
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB (the website build alone briefly needs ~2 GB) |
| Disk | 60 GB SSD | 80 GB+, more if you upload many photos |

**Operating system:** a current Ubuntu LTS (e.g. 24.04) or Debian, on which
Coolify's installer is supported.

**Firewall:** allow only

| Port | For |
| --- | --- |
| 22 | SSH (key login only; turn password login off) |
| 80, 443 | the website (Coolify's proxy) |
| 8000 | Coolify's own dashboard, until you give it a domain with HTTPS; then close it, or limit it to your own IP |

Never open 5432 (PostgreSQL) or the API's port 8000 *inside* Docker to the
Internet. Coolify doesn't publish them as long as you don't give them a
public port or domain.

**Housekeeping:** turn on automatic security updates
(`sudo apt install unattended-upgrades`) and keep Coolify updated from its
dashboard.

## 4. Secrets and settings

Enter these in Coolify (each application → **Environment Variables**). Mark
passwords and keys as secret/locked so they're hidden in the dashboard.
**Never commit real values to Git**; `infra/.env.example` holds placeholders only.

### API application

| Variable | Value | Notes |
| --- | --- | --- |
| `GC_DATABASE_URL` | `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB` | Copy the **internal** URL from the Coolify PostgreSQL resource and change its start from `postgres://` to `postgresql+psycopg://`. |
| `GC_SECRET_KEY` | 64 random characters | Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. **Store it in your password manager too**: it encrypts the admins' MFA secrets. Losing it means both admins must reset MFA. |
| `GC_ALLOWED_ORIGINS` | `https://gincabinet.example.com` | Your exact public address(es), comma-separated. Add the `www.` version only if you serve it. |
| `FORWARDED_ALLOW_IPS` | `172.16.0.0/12` | Which senders may report the visitor's IP. Private Docker range only, **never `*`**. See [§9](#9-real-visitor-ip-and-cloudflare). |
| `GC_ENVIRONMENT` | `production` | Already the image default. Turns off the API docs pages. |
| `GC_COOKIE_SECURE` | `true` | Already the image default. Cookies only over HTTPS. |
| `GC_MIGRATE_ON_START` | `true` (default) | Set to `false` only if you run migrations another way. |

Optional, with sensible defaults (see `apps/api/app/config.py`):
`GC_MAX_UPLOAD_MB` (15), `GC_MAX_IMAGE_SIDE` (3000 px),
`GC_SESSION_IDLE_MINUTES` (30), `GC_SESSION_ABSOLUTE_HOURS` (12),
`GC_TOTP_ISSUER` ("The Gin Cabinet", the name shown in authenticator apps).

### Web application

| Variable | Value | Notes |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://<api internal host>:8000` | Needed **at build time and at run time**: tick Coolify's "build variable" option *and* keep it as a normal variable. `<api internal host>` is the API application's container name on the Coolify network (shown in the API app's settings; usually its resource ID). |
| `SITE_URL` | `https://gincabinet.example.com` | Used for canonical links, the sitemap, RSS and social-media previews. No trailing slash. |

The website gets **no** database URL or secret key; it doesn't need them.

### PostgreSQL resource

Coolify generates the user, password and database name. Note them in your
password manager. Leave **"Make it publicly available"** off.

## 5. First deployment, step by step

1. **Install Coolify** on the server (one command from coolify.io). Open the
   dashboard, create your admin account, and give the dashboard its own
   domain with HTTPS (e.g. `coolify.example.com`).
2. **DNS:** create an `A` record (and `AAAA` for IPv6) for your site's domain
   pointing at the server. If you use Cloudflare, start with the proxy **off**
   (grey cloud) and read [§9](#9-real-visitor-ip-and-cloudflare) before turning it on.
3. **Project:** create project `the-gin-cabinet` with environment `production`.
4. **Backup storage:** in Coolify → **S3 Storages**, add your bucket (endpoint,
   region, bucket name, access key, secret key) and test the connection.
5. **Database:** add a **PostgreSQL 16** resource. Keep it private. Under
   **Backups**, schedule a daily backup to the S3 storage, e.g. 03:00,
   keeping 30 copies. Start it.
6. **API application:** add an application from the Git repository.
   * Build pack: **Dockerfile**; base directory `/apps/api`; Dockerfile `Dockerfile`.
   * Branch: `main`.
   * Port: `8000`. **No domain** (it must stay private).
   * Health check: path `/health`, port `8000`.
   * Persistent storage: add a **volume** mounted at `/app/media` (keep
     Coolify's suggested volume name; a volume rather than a folder keeps the
     right file permissions for the image's non-root user).
   * Environment: the API variables from [§4](#api-application).
   * Deploy. Watch the log: you'll see the migrations
     (`Running upgrade … -> 0007`) and then `Uvicorn running`. It turns
     healthy once `/health` reports the database is reachable.
7. **Web application:** add a second application from the same repository.
   * Build pack: **Dockerfile**; base directory `/apps/web`.
   * Port: `3000`. Domain: `https://gincabinet.example.com` (Coolify gets
     the HTTPS certificate automatically once DNS points at the server).
   * Health check: path `/health`, port `3000`.
   * Environment: the web variables from [§4](#web-application).
   * Deploy.
8. **Create the two admin accounts** in the API application's **Terminal**:

   ```bash
   python -m app.cli create-admin --username anna --email anna@example.com --display-name "Anna"
   ```

   It asks for a password (12+ characters; a passphrase is best), then prints
   an MFA key and 10 recovery codes **once**. Add the key to the admin's
   authenticator app and save the recovery codes in the password manager.
   Repeat for the second admin. There are no public sign-ups; at most two
   accounts can exist.
9. **Smoke test** with the [go-live checklist](#10-go-live-checklist).

## 6. Updates and rollbacks

**Deploying a new version:** push to `main`, then press **Deploy** on the
API first, then the web application. You can also turn on automatic
deployment on push in Coolify. Coolify builds the new image, starts it next to
the old one, waits for its health check, and only then switches traffic.
If the new container never becomes healthy, the old one keeps running.

**Database migrations** run automatically when the new API container
starts (`alembic upgrade head`, in `apps/api/Dockerfile`). Two rules follow:

* **Before a release that changes the database**, take a manual database
  backup (PostgreSQL resource → Backups → *Backup now*).
* **Keep migrations backward-compatible**: for a moment the *old* API runs
  against the *new* schema. Add columns and tables freely. Rename or delete
  in two releases: first stop using the old column, then remove it.

(Why not Coolify's "pre-deployment command"? It runs inside the **old**
container, which doesn't contain the new migrations. The "post-deployment
command" runs only *after* traffic has switched.)

**Rolling back:** in the application's **Deployments** list, redeploy the
previous successful commit. If that release changed the database and the
old code can't work with the new schema, restore the backup taken before the
release ([§7](#7-backups-and-restores)). Undoing a migration by hand
(`alembic downgrade <revision>` in the API terminal) is possible but can lose
data in new columns, so prefer the backup.

## 7. Backups and restores

A database backup does **not** include the photos (spec §10B). Back up three things:

| What | How | Where it goes |
| --- | --- | --- |
| Database | Coolify scheduled backups (step 5 above) | S3 bucket |
| Photos (`/app/media` volume) | Nightly job on the server (below) | S3 bucket |
| `GC_SECRET_KEY` and the database password | Once, by hand | Password manager |

The data export in Admin (JSON / CSV) is a handy extra copy but is not a
backup: it has no photos and no account data.

**Photo backup with [restic](https://restic.net)** (encrypted, keeps
history). On the server, as root:

```bash
apt install restic
# Find the volume's folder on disk (name as shown in Coolify's Persistent Storage):
docker volume inspect <media-volume-name> --format '{{ .Mountpoint }}'

# /root/backup-media.env (chmod 600), values for your bucket:
#   export RESTIC_REPOSITORY=s3:https://<s3-endpoint>/<bucket>/media
#   export RESTIC_PASSWORD=<another long random secret: keep it in the password manager>
#   export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...

source /root/backup-media.env && restic init          # once
# Nightly at 03:30 (crontab -e):
# 30 3 * * * . /root/backup-media.env && restic backup <mountpoint> && restic forget --keep-daily 14 --keep-weekly 8 --prune
```

### Test a restore before going live (spec §10B step 7)

Do this into a *separate* Coolify environment (e.g. `staging`), never over production:

1. Create a new PostgreSQL resource and restore the latest backup into it
   (Coolify's restore option, or `pg_restore`/`psql` from its terminal).
2. Restore the photos: `restic restore latest --target /tmp/restore`, then
   copy the files into the staging API's media volume.
3. Deploy API + web pointing at the staging database, sign in, and check that
   gins, reviews, articles **and their photos** appear.
4. Write down how long it took: that's your recovery time.

Repeat the test every few months, and after big changes.

## 8. Monitoring and logs

* **Notifications:** Coolify → Notifications: connect email, Discord or
  Telegram for failed deployments, failed backups and unhealthy containers.
* **Uptime monitor:** check every few minutes from outside:
  * `https://<domain>/health`: the website is running.
  * `https://<domain>/api/v1/public/site`: the website, API **and** database
    all work (expect HTTP 200).
* **Logs:** each application's **Logs** tab in Coolify. The **Audit log**
  inside the site (Admin → Audit log) shows sign-ins, failed sign-in
  attempts and every change, with the visitor's IP.
* **Disk space:** keep an eye on it in Coolify's server view. Old Docker
  images pile up; Coolify can clean them automatically.

## 9. Real visitor IP and Cloudflare

The API slows down password guessing per username **and** per IP address, so
it needs the visitor's real IP (spec §10B "verify real-client-IP trust
boundaries"). The chain is:

1. Coolify's proxy receives the visitor and **appends** their IP to the
   `X-Forwarded-For` header.
2. Next.js passes that header on to the API unchanged (tested).
3. Uvicorn reads `X-Forwarded-For` **from right to left**, skipping senders
   listed in `FORWARDED_ALLOW_IPS`, and uses the first address that isn't one
   of them.

So `FORWARDED_ALLOW_IPS` must list only the private Docker network
(`172.16.0.0/12`). The right-most entry is then the one written by Coolify's
proxy, which a visitor cannot fake. **Never use `*`**: uvicorn would then
believe the left-most entry, which the visitor controls.

**With Cloudflare's proxy (orange cloud) on:**

* SSL/TLS mode **Full (strict)** (spec §10B). Never "Flexible".
* Cloudflare's address becomes the right-most entry, so every visitor would
  look like Cloudflare. Configure Coolify's proxy to take the client IP from
  Cloudflare's `CF-Connecting-IP` header (trusting only
  [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)), then check in
  Admin → Audit log that sign-ins show your real IP.
* The simplest safe start is Cloudflare DNS only (grey cloud).

## 10. Go-live checklist

Infrastructure
- [ ] `https://<domain>/health` → `{"status":"ok"}`
- [ ] `https://<domain>/api/v1/public/site` → 200
- [ ] `http://<domain>` redirects to `https://`
- [ ] From another network, the server's ports 5432 and 8000 (API) don't answer
- [ ] `GC_SECRET_KEY`, database password and restic password are in the password manager

Accounts
- [ ] Both admins can sign in with password + authenticator code
- [ ] Both admins have saved their recovery codes; one recovery code tested

Content and privacy (spec §11, §10B step 6)
- [ ] Upload a photo, publish a test gin, review, cocktail and Journal article
- [ ] A private gin and a draft article show **404** to a signed-out visitor
- [ ] `https://<domain>/sitemap.xml` and `/blog/rss.xml` list only public content
- [ ] Admin → Audit log shows your real IP on sign-in

Resilience (spec §10B acceptance)
- [ ] A database backup has reached the S3 bucket
- [ ] A photo backup has reached the S3 bucket
- [ ] A test restore succeeded ([§7](#test-a-restore-before-going-live-spec-10b-step-7))
- [ ] Redeploying the API (container replaced) keeps all data and photos
- [ ] Coolify notifications and the uptime monitor are set up

## 11. Emergency and maintenance commands

Run in the API application's **Terminal** in Coolify:

```bash
python -m app.cli list-admins                      # who exists, last sign-in
python -m app.cli reset-password --username anna   # lost password (signs them out everywhere)
python -m app.cli reset-mfa      --username anna   # lost phone + recovery codes: new key and codes
python -m app.cli run-jobs                         # publish due scheduled articles right now
alembic current                                    # which database migration is applied
```

Every command is recorded in the audit log.
