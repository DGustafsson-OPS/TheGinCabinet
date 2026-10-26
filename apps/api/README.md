# The Gin Cabinet API (FastAPI)

The Python backend. It owns the database, enforces every security and privacy
rule, and serves JSON to the Next.js frontend.

This README is written for someone learning Python and web backends, so it
explains *why* as well as *how*.

---

## 1. Run it locally

You need Python 3.12 or newer (`python3 --version`).

```bash
cd apps/api

# A virtual environment ("venv") is a private folder of Python packages for
# this project only, so it can't clash with other projects on your computer.
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install the app in "editable" mode (-e) plus the dev tools ([dev]).
pip install -e ".[dev]"

# Create the database tables. Without configuration this uses a local SQLite
# file (gin_cabinet.db), which is fine for learning. Production uses PostgreSQL.
alembic upgrade head

# Create your admin account. You'll be asked for a password, then shown an
# MFA key to add to an authenticator app, plus one-time recovery codes.
python -m app.cli create-admin --username anna --email anna@example.com --display-name "Anna"

# Start the server. --reload restarts it whenever you save a file.
uvicorn app.main:app --reload
```

Now open **<http://127.0.0.1:8000/api/v1/docs>**. FastAPI generates this page
automatically from the code; you can call every endpoint from your browser.

To use PostgreSQL locally instead, set an environment variable first:

```bash
export GC_DATABASE_URL="postgresql+psycopg://USER:PASSWORD@localhost:5432/gin_cabinet"
```

## 2. Run the checks

```bash
pytest                 # run all tests (about 10 seconds)
pytest -k throttle     # run only tests whose name contains "throttle"
ruff check .           # lint: find likely bugs and style problems
ruff format .          # auto-format the code
```

To run the tests against PostgreSQL (as CI does), point them at an **empty**
test database. Its tables are dropped and recreated for every test:

```bash
GC_TEST_DATABASE_URL="postgresql+psycopg://USER:PASSWORD@localhost:5432/gin_test" pytest
```

## 3. How the code is organised

```
apps/api/
├── app/
│   ├── main.py            ← entry point: builds the FastAPI app, adds routes
│   ├── config.py          ← settings read from GC_* environment variables
│   ├── db.py              ← database connection + per-request sessions
│   ├── errors.py          ← one JSON error format for the whole API
│   ├── cli.py             ← admin command-line tool (create-admin, reset-…)
│   ├── models/            ← database tables, one Python class per table
│   ├── schemas/           ← exact shape of JSON in/out (Pydantic)
│   ├── security/          ← passwords, MFA, encryption, random tokens
│   ├── services/          ← business logic: sessions, throttling, audit log
│   └── api/
│       ├── deps.py        ← "must be logged in" / CSRF checks, reused by routes
│       └── routes/        ← the URLs: health, auth, admin/audit
├── migrations/            ← Alembic: versioned database schema changes
├── tests/                 ← pytest tests
└── Dockerfile             ← production container image
```

The **layers** idea: a request flows `routes → services → models`.
Routes deal with HTTP (URLs, status codes, cookies). Services hold the rules
("lock out after 5 failures"). Models describe the tables. Keeping them apart
means the CLI can reuse the same services as the API, and each piece can be
tested on its own.

## 4. How signing in works (spec §9)

```
Browser                                   API
  │ POST /api/v1/auth/login {user, pass}   │  check throttle → verify Argon2id hash
  │ ◄── 200 {mfa_required: true}           │  create *pending* session (5 min)
  │     + Set-Cookie: gc_session=…         │
  │                                        │
  │ POST /api/v1/auth/mfa/verify {code}    │  check TOTP or one-time recovery code
  │ ◄── 200 {user, csrf_token, …}          │  revoke pending, create *full* session
  │     + Set-Cookie: gc_session=(new)     │  write audit event "auth.login"
  │                                        │
  │ GET /api/v1/admin/audit                │  require_admin: cookie → valid session?
  │ POST … + header X-CSRF-Token: …        │  require_admin_write: + CSRF + Origin check
```

| Protection | Where | Why |
| --- | --- | --- |
| Argon2id password hashes | `security/passwords.py` | A stolen database doesn't reveal passwords |
| TOTP MFA + hashed recovery codes | `security/mfa.py` | A stolen password alone isn't enough |
| TOTP secret encrypted at rest | `security/crypto.py` | Needs `GC_SECRET_KEY` to read |
| HttpOnly + Secure + SameSite cookie | `api/routes/auth.py` | JavaScript can't steal the session |
| Only token *hashes* stored | `services/sessions.py` | A DB leak can't hijack sessions |
| 30 min idle / 12 h absolute expiry | `services/sessions.py` | Forgotten sessions die |
| New token after MFA | `api/routes/auth.py` | Prevents session fixation |
| CSRF token + Origin check | `api/deps.py` | Other sites can't act as you |
| Login throttling | `services/throttle.py` | Slows password/code guessing |
| Audit events | `services/audit.py` | Who did what, when |
| No sign-up endpoint | `cli.py` | Max two admins, created from the server |

## 5. Admin command-line tool

Run these on the server (e.g. Coolify's terminal for the API container):

```bash
python -m app.cli create-admin   --username anna --email anna@example.com --display-name "Anna"
python -m app.cli reset-password --username anna   # lost password; signs out all sessions
python -m app.cli reset-mfa      --username anna   # lost phone; new key + recovery codes
python -m app.cli list-admins
```

Each command writes an audit event.

## 6. Configuration

All settings are environment variables starting with `GC_`; see
[`app/config.py`](app/config.py) for the full list with explanations and
[`../../infra/.env.example`](../../infra/.env.example) for a template.
In production you **must** set at least `GC_DATABASE_URL`, `GC_SECRET_KEY`,
`GC_ALLOWED_ORIGINS` and `GC_COOKIE_SECURE=true` (the Docker image defaults
the last one to `true`).

> ⚠️ Changing `GC_SECRET_KEY` makes stored MFA secrets unreadable. Admins would
> then need `reset-mfa`. Keep it in Coolify's secret store and back it up.

## 7. Database migrations

When you change a model in `app/models/`, create a migration so the real
database follows:

```bash
alembic revision --autogenerate -m "add gin_products"   # writes a new file in migrations/versions/
# READ the generated file! Autogenerate is a helpful draft, not always perfect.
alembic upgrade head                                    # apply it
alembic check                                           # confirms models and DB match
```
