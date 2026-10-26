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
| Design tokens, header/sidebar, admin login UI | ⬜ | Next.js app in `apps/web` |
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
| Admin UI screens for inventory | ⬜ | Next.js pages for A02–A04, A08 |
| Editing purchase lines after saving | ⬜ | Lines are fixed in V1 because they already created bottles |

## Phase 3 – Editorial ⬜
Tastings, reviews with revision history and draft→ready→published→archived,
media library (EXIF GPS stripping), preview.

## Phase 4 – Cocktails ⬜
Ingredient master, recipe editor, serving scaler (1–12), gin recommendations,
public recipe library.

## Phase 5 – Public website ⬜
Home, collection, gin profiles, reviews, distilleries, about, SEO, sitemap.
Plus the Gin Journal blog (spec §10A).

## Phase 6 – Launch QA ⬜
Security review, accessibility, performance, backup/restore test, Coolify runbook.

## Known follow-ups
- TOTP codes can be reused within their ~90 s validity window; add a
  "last used time step" per user to block replay.
- Old rows in `login_attempts` and expired `auth_sessions` should be pruned by a
  periodic job (comes with the scheduled-publishing job in the blog phase).
- A known username can be temporarily locked out (15 min) by someone guessing
  wrong passwords. Acceptable for two admins, but worth knowing.
