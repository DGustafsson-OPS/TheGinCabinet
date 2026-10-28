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
| Gin reviews ↔ tonics | A review can pick its tonic from the list; the review links to the tonic page, which lists "Gins we pour it with" |
| Dashboard quick actions (A01) | Shortcuts to add a gin, purchase, bottle, tasting, review, cocktail, article, tonic, photos |
| Authenticator codes work once | Each admin's last used 30-second step is stored; the same or older code is refused (migration 0010) |
| In-page dialogs only; every removal confirmed | No browser popups anywhere (`alert`/`confirm`/"Leave site?"). Every Remove/Delete/Discard asks first in an in-page dialog. Unsaved Journal edits: in-page "Leave without saving?" for links, and a restorable local copy for reloads and closed tabs |
| Content-Security-Policy | `proxy.ts` + `lib/csp.ts`: a fresh script nonce per page, `'strict-dynamic'`, GA hosts only when GA is configured; tested against a smuggled `<script>` |

## After launch ✅

| Item | Notes |
| --- | --- |
| Editor role | `users.role` admin/editor (migration 0012). Editors: Journal, reviews, tastings, cocktails, tonics, media, page texts; read-only gins. Not: inventory, prices, settings, messages, accounts, audit. API default is admin-only (`CurrentAdmin`); content routes opt in with `CurrentStaff` |
| Invitations | Admin → Settings → People: one-time link (7 days, only its hash stored); the person chooses their own password and authenticator. New link / cancel for unused invitations. At most 2 admins, 10 accounts |
| Edit someone else's account | Display name (no password), email, role, access (your password). Audited, and the person sees a notice. Accounts in use are switched off, never deleted |
| Page texts | Admin → Page texts: home intro/eyebrow/empty state, About intro/body/contact, contact page intro, footer. Defaults in `services/page_texts.py`; simple formatting (`##`, lists, `**bold**`, links), rendered safely by `FormattedText`. The old "About page text" setting moved here |
| Contact form + Cloudflare Turnstile | `/contact`, verified server-side, 5/hour per IP (hashed), honeypot field, Admin → Messages (admins only), deleted after a year. Off unless both Turnstile keys are set |
| Links not underlined | Never underlined, not even on hover; links inside text are semi-bold so they don't rely on colour alone (WCAG 1.4.1), and keyboard focus shows the focus ring |
| Edit everything | Distilleries (`/juniper/distilleries/{id}`), purchases (date, shop, currency, reference, notes and each line's price; gin/size/quantity stay fixed because they created bottles), wishlist items (a dropped one can be put back). Tastings stay editable by their author only |
| Photos and gins added in place | "Upload a new photo…" in the gin, tonic, review, cocktail, Journal and logo forms; "Add a new gin…" in the purchase form (brand, name, ABV; the rest later) |
| Ratings in admin | Gin list and gin page show the average published review rating and our tasting average, with shortcuts to rate |
| EUR by default | Purchases and wishlist default to EUR; any 3-letter currency can still be typed (suggestions: EUR, SEK, NOK, DKK, GBP, USD). Päihdelinkki link points to the English site |
| Media library folders and bulk edit | Each image has a name (from the file name at upload) and an optional folder path like `Gins/Hernö` (migration 0013; no folders table: a folder exists while an image is in it). Browse by folder, upload into the open folder, rename/move a folder with its subfolders, and for ticked images: move, rename as a numbered series, set the credit, delete (images in use are skipped and listed). Pickers show "Folder › Name — description" |
| Gin guide | Lasting reference pages at `/guide` (migration 0014, table `guide_pages`): title, summary, cover photo, Journal-style text blocks (now with `**bold**` and `*italic*`), address and SEO, all editable under Admin → Gin guide by admins and editors. Pages have a chosen order (↑/↓), Publish/Unpublish, preview and delete; the menu link appears once one is published. Intro text under Page texts. Six starter drafts (styles, history, glassware, botanicals, G&T, tasting) come with the migration, unpublished |
| Watermarks | Per image (Media → image, at upload, or in bulk): a small "© site name" mark bottom-right and/or an "AI-generated" label bottom-left (migration 0015). The original file is kept untouched; the website shows a marked copy (`display_key`) and the unmarked original isn't served while a mark is on. Marks use the site name at the time they're drawn |
| Form layout | Two-column admin forms use `minmax(0, 1fr)` so a long dropdown can't push a column out of the card |

## Phase 8 – Launch QA ⬜
Security review, accessibility audit, performance, backup/restore test,
Coolify runbook walk-through.

## Known follow-ups
- Adding a third-party script or service (maps, video embeds, another
  analytics tool) means allowing its hosts in `apps/web/lib/csp.ts`, or the
  browser will block it.
- A known username can be temporarily locked out (15 min) by someone guessing
  wrong passwords. Acceptable for two admins, but worth knowing.
