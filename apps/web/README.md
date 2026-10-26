# The Gin Cabinet website (Next.js)

The public site, the admin area and (later) the Gin Journal blog. It talks to
the FastAPI backend in `apps/api`.

## 1. Run it locally

You need Node.js 20.9+ (`node --version`) and the API running on port 8000
(see `apps/api/README.md`).

```bash
cd apps/web
npm install          # install the exact versions from package-lock.json
npm run dev          # http://localhost:3000, reloads when you save a file
```

Sign in at <http://localhost:3000/login> with the admin you created using the
API's `create-admin` command.

## 2. Checks

```bash
npm run lint         # ESLint: likely bugs and React mistakes
npm run typecheck    # TypeScript: type errors anywhere in the project
npm run build        # the production build (also type-checks)
npm run test:e2e     # browser tests, see e2e/README.md
```

## 3. How it is organised

```
apps/web/
├── app/                      ← every folder here is a URL ("App Router")
│   ├── layout.tsx            ← wraps every page: <html>, fonts, skip link
│   ├── (public)/             ← public site; "(…)" folders don't appear in URLs
│   │   ├── layout.tsx        ← forest masthead + footer
│   │   ├── page.tsx          ← "/" home: numbers, latest reviews, cocktails, a featured gin
│   │   ├── collection/       ← "/collection": search + filters (a plain GET form)
│   │   ├── gins/[slug]/      ← one public gin: photos, botanicals, reviews, cocktails, related
│   │   ├── distilleries/     ← list and "/distilleries/[slug]"
│   │   ├── blog/             ← the Gin Journal: /blog, /blog/[slug], category/ and tag/ pages, rss.xml
│   │   ├── about/, privacy/  ← static pages
│   │   ├── reviews/          ← "/reviews" list and "/reviews/[slug]" (public)
│   │   └── cocktails/        ← "/cocktails" library and recipe pages with a serving stepper
│   ├── login/                ← "/login": page + the two-step LoginForm
│   ├── admin/                ← "/admin": sidebar layout + dashboard
│   │   ├── gins/             ← list, new, [id] edit (with conflict screen)
│   │   ├── distilleries/     ← list + add
│   │   ├── bottles/          ← list, new, [id] with actions and history
│   │   ├── purchases/        ← list, new (multi-line form), [id]
│   │   ├── wishlist/         ← list + add, [id]/convert to a purchase
│   │   ├── media/            ← upload (drag and drop) + edit alt text
│   │   ├── tastings/         ← private notes with flavour sliders
│   │   ├── reviews/          ← editor, preview, revision history
│   │   ├── cocktails/        ← tabbed recipe editor
│   │   ├── blog/             ← Journal list, block editor (with autosave), categories, preview, history
│   │   ├── settings/         ← website settings, profile, password & MFA, the two admins
│   │   └── audit/            ← audit log viewer
│   ├── sitemap.ts, robots.ts ← "/sitemap.xml" (public pages only), "/robots.txt"
│   ├── health/route.ts       ← "/health" for Docker/Coolify
│   └── not-found.tsx         ← any unknown URL
├── components/               ← reusable pieces (headers, sidebar, buttons)
│   └── admin/                ← AdminProvider (CSRF + toasts), ConfirmButton,
│                               ConflictPanel, SearchBox, FilterSelect, PurchaseForm…
├── lib/
│   ├── server-api.ts         ← server-only API calls + requireAdmin()
│   ├── api-client.ts         ← browser API calls (adds the CSRF header)
│   └── types.ts              ← shapes of the API's JSON
├── styles/
│   ├── tokens.css            ← design tokens: colours, spacing, fonts (spec §2)
│   └── globals.css           ← base styles, buttons, forms, cards
└── e2e/                      ← Playwright browser tests
```

### Server and client components

Next.js renders components on the **server** by default: they can read cookies
and call the API privately, and the browser just receives HTML. A file that
starts with `"use client"` also runs **in the browser**, which is needed for
anything interactive (typing in a form, opening a menu). This project keeps
client components small: `LoginForm`, `PublicHeader`, `AdminSidebar` and
`SignOutButton`.

### How a request reaches the API

```
Browser ──/api/v1/...──▶ Next.js ──(rewrite)──▶ FastAPI :8000
Browser ──/admin──────▶ Next.js server component ──(cookie forwarded)──▶ FastAPI
```

The browser only ever talks to one site, so the session cookie and the CSRF
check just work. `next.config.ts` sets up the `/api` forwarding. Its target
(`API_INTERNAL_URL`) is fixed when `npm run build` runs.

### Forms that change data

Admin forms are client components. They get the CSRF token and a `toast()`
function from `AdminProvider` through `useAdmin()`, call the API, then run
`router.refresh()` so the server parts of the page fetch fresh data.

Edit forms send **only the fields you changed**, plus the record's `version`.
If someone else saved in the meantime, the API answers `409` and
`ConflictPanel` shows both versions with two deliberate choices (spec §6).

### Lists of rows (keys and ids)

Forms with repeatable rows (purchase lines, recipe ingredients) give each row a
React `key`. Those keys must be **the same on the server and in the browser**,
otherwise the HTML ids built from them don't match after hydration and two
inputs can end up sharing an id. So rows loaded with the page are keyed by
position (`init-0`…), new rows by a counter kept *inside* the component, and
ids are prefixed with React's `useId()`. Never use a module-level counter.

### Who may see /admin?

Every admin page starts with `await requireAdmin()` (in `lib/server-api.ts`),
which asks the API for the session and redirects to `/login` if needed. The
check lives in each **page**, not only in the layout, because Next.js layouts
don't re-run on every navigation. The API still checks every request itself;
the website check is about showing the right page.

## 4. Design tokens

All colours, spacing and sizes are CSS variables in `styles/tokens.css`, taken
from spec §2 (forest `#19251F`, brass `#C7A46B`, cream `#F5F0E6`...). Text
colours were checked against WCAG AA contrast (at least 4.5:1).

## 5. Environment variables

| Variable | Used for | Default |
| --- | --- | --- |
| `API_INTERNAL_URL` | Where Next.js finds FastAPI (build time for `/api`, run time for server pages) | `http://127.0.0.1:8000` |
| `SITE_URL` | Public address for canonical links and social images | `http://localhost:3000` |
| `PORT` / `HOSTNAME` | Where the production server listens | `3000` / `0.0.0.0` in Docker |
