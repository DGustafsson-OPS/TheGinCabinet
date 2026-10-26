# Roadmap

Progress against the delivery phases in
[specification §12](specification-v1.1.md#12-delivery-phases-and-decisions).

## Phase 1 – Foundation

| Item | Status | Notes |
| --- | --- | --- |
| Monorepo layout (spec §10) | ✅ | `apps/api`, `apps/web`, `packages/shared`, `infra`, `docs` |
| Database + migrations | ✅ | SQLAlchemy 2 + Alembic; `users`, `collections` (seeded single row), `audit_events`, sessions, recovery codes, login attempts |
| Auth: Argon2id, TOTP MFA, recovery codes | ✅ | `apps/api/app/security/` |
| Sessions: HttpOnly cookie, idle + absolute expiry, revocation | ✅ | Server-side, token hashes only |
| CSRF token + Origin check, login throttling | ✅ | |
| Audit log + `GET /api/v1/admin/audit` | ✅ | |
| Admin bootstrap / recovery CLI | ✅ | Max two admins; password and MFA reset |
| Health endpoint, Dockerfile, docker-compose | ✅ | Non-root, multi-stage, healthcheck |
| CI (lint + tests on PostgreSQL) | ✅ | `.github/workflows/api.yml` |
| Design tokens, header/sidebar, admin login UI | ✅ | `apps/web`: tokens, public masthead, admin sidebar, two-step login, dashboard |
| Browser tests (Playwright) + web CI | ✅ | `.github/workflows/web.yml` runs them against the real API |
| Admin self-service: change password, revoke sessions (A10) | ⬜ | |

## Phase 2 – Inventory (backend)

| Item | Status | Notes |
| --- | --- | --- |
| Distilleries, botanicals, gin catalogue (A02) | ✅ | ABV 0–100, case-insensitive identity uniqueness, unique slugs |
| Physical bottles with status history (A03) | ✅ | sealed → open → empty / gifted / disposed; every change in `bottle_events` |
| Purchases creating N bottles (A04) | ✅ | Per-currency totals, optional price for gifts |
| Wishlist + convert to purchase (A08) | ✅ | Notes kept, linked to the purchase |
| Dashboard numbers (A01) | ✅ | Value per currency; unknown cost shown separately |
| Optimistic locking: 409 + diff, `?force=true` (§6) | ✅ | Plus database-level `WHERE version = ?` check |
| CSV import with preview / dedupe / reasons (§6, §11) | ✅ | Gins; `,` or `;` separated; `|` between botanicals |
| Export (§6) | ✅ | Full JSON export + gins CSV (formula-injection safe) |
| Admin UI screens for inventory | ✅ | Gins (with 409 conflict screen), distilleries, bottles (actions + history), purchases, wishlist |
| Editing distilleries and purchase headers in the UI | ⬜ | The API supports it; screens to follow |
| Choosing gins from long lists | ⬜ | Gin dropdowns show the first 100; switch to search-as-you-type when the catalogue grows |
| Editing purchase lines after saving | ⬜ | Lines are fixed in V1 because they already created bottles |

## Phase 3 – Editorial

| Item | Status | Notes |
| --- | --- | --- |
| Media library API (A09) | ✅ | JPEG/PNG/WebP only, size + pixel limits, re-encoded (EXIF/GPS removed), random file names, alt text / decorative flag, in-use delete protection, soft delete |
| Tasting journal API (A05) | ✅ | Private; flavour scores 0–5; rating 0–10; only the author can edit; optional link to a bottle of the same gin |
| Review API (A06) | ✅ | draft → ready → published → archived (+ withdraw); revision snapshot on every change; 409 conflicts; publish checks (public gin, verdict, rating, cover alt text) |
| Public reviews API (P04/P05) | ✅ | Only published reviews of public gins; 404 otherwise; no private fields |
| Admin screens: media, tastings, review editor, preview, revisions | ✅ | Drag-and-drop upload, flavour sliders, workflow buttons with publish checks, conflict screen |
| Public review pages (P04/P05) | ✅ | `/reviews` (search, sort) and `/reviews/[slug]` with SEO metadata, Open Graph image and JSON-LD |

## Phase 4 – Cocktails

| Item | Status | Notes |
| --- | --- | --- |
| Ingredient master + recipe API (A07) | ✅ | Ordered ingredient lines (decimal quantity + metric unit, "top up" has none), ordered steps, gin pairings with priority and note, tags, method/difficulty/glassware |
| Serving scaler (P07) | ✅ | `?servings=1–12`; exact Decimal maths; garnish count scales; step text never changes |
| Public library + detail API (P06/P07) | ✅ | Published only; filters (search, method, difficulty, tag); recommended gins only if public |
| Gin → cocktails API | ✅ | `/public/gins/{slug}/cocktails` reads the same pairing table (consistent both ways) |
| Admin cocktail editor (A07) | ✅ | Accessible tabs (arrow keys); ingredient/step/gin rows with reorder; save keeps the open tab |
| Public library + recipe pages (P06/P07) | ✅ | Filter chips, cards, serving stepper as plain links (works without JavaScript), Recipe JSON-LD |

## Phase 5 – Public website ✅

| Item | Status | Notes |
| --- | --- | --- |
| Gin photos (A02 "images") | ✅ | Ordered `gin_images`; count as media "in use" |
| Public catalogue API (P02/P03) | ✅ | Search, style/country/botanical/ABV/rating filters, sort, facets, Owned/Previously owned badge, average rating; gin page with reviews, cocktails and related gins (style + botanical overlap); never prices or counts |
| Public distilleries API (P08) | ✅ | Only distilleries with public gins |
| Public stats (P01) | ✅ | Public gins, reviews, cocktails, countries |
| Public pages: home, collection, gin, distilleries, about/privacy, sitemap, robots | ✅ | Filters work without JavaScript (plain GET form); private gins 404 and stay out of the sitemap |

## Phase 6 – The Gin Journal (§10A) ✅

| Item | Status | Notes |
| --- | --- | --- |
| Data model (blog_posts, categories, tags, revisions, relations) | ✅ | Migration 0006 seeds the six suggested categories |
| Block body (heading, paragraph, list, quote, image, card) | ✅ | JSON data, never HTML; links only https/http or /paths |
| Admin API + workflow (draft → scheduled/published → archived) | ✅ | Optimistic locking, autosave for drafts only, bulk archive, duplicate, revisions |
| Scheduled publishing job | ✅ | Every minute inside the API, idempotent; also `python -m app.cli run-jobs`; prunes old sessions/login attempts |
| Admin UI: A11 list, A12 editor, A13 categories, preview, history | ✅ | Unsaved-change warning, confirmation before publish/schedule/archive |
| Public UI: B01 /blog, B02 article, B03 category/tag pages | ✅ | Featured hero, chips, search, related stories, Article JSON-LD, Open Graph |
| RSS (/blog/rss.xml) and sitemap entries | ✅ | Only live articles |

## Phase 7 – Settings & admins (A10) ✅

| Item | Status | Notes |
| --- | --- | --- |
| Website settings (name, tagline, description, logo, contact, About text) | ✅ | One versioned row; About page reads it; logo counts as media "in use" |
| Default visibility of new gins | ✅ | Used when a new gin doesn't say |
| Own profile: name, email (needs password) | ✅ | |
| Change password | ✅ | Policy checked; other sessions signed out |
| Move MFA to a new app | ✅ | Two steps: new secret is pending until a code from it is confirmed |
| New recovery codes | ✅ | Shown once |
| Reset the other admin's password | ✅ | Your password + their username typed; their sessions end; audit event; they see a notice |
| Audit log viewer | ✅ | Filters by action and area; IP shown to admins only |

## Added after the spec ✅

| Item | Notes |
| --- | --- |
| 18+ age gate | Every public page, server-checked cookie, works without JavaScript |
| Google Analytics with our own consent manager | Categories, Cookie settings page, proof of consent (no personal data), policy versions |
| Admin area at `/juniper` | `/admin` is a 404; not listed in robots.txt |
| Tonics | Simple catalogue (no stock) with per-admin reviews (draft/published), public list + pages |

## Phase 8 – Launch QA ⬜
Security review, accessibility audit, performance, backup/restore test,
Coolify runbook walk-through.

## Known follow-ups
- Content-Security-Policy header for the website (needs per-request nonces with
  Next.js); other security headers are already set.
- Dashboard "quick actions" (A01) arrive with the inventory screens.
- TOTP codes can be reused within their ~90 s validity window; add a
  "last used time step" per user to block replay. (The e2e tests sign in
  twice per test with the same code, so they need a helper that waits for
  the next code first.)
- A known username can be temporarily locked out (15 min) by someone guessing
  wrong passwords. Acceptable for two admins, but worth knowing.
