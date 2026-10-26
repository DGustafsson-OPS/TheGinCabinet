# The Gin Cabinet

A shared gin collection website: public gin profiles, reviews, cocktail recipes
and the Gin Journal blog, plus a private admin area for two administrators to
manage inventory, tastings and editorial content.

The full product and technical specification lives in
[`docs/specification-v1.1.md`](docs/specification-v1.1.md).
Progress against its delivery phases is tracked in [`docs/roadmap.md`](docs/roadmap.md).

## Repository layout (spec §10)

| Folder | What lives there | Status |
| --- | --- | --- |
| [`apps/api/`](apps/api/) | FastAPI (Python) backend: database, auth, business rules | Phase 1 foundation built |
| [`apps/web/`](apps/web/) | Next.js public site, admin UI and blog | Not started |
| [`packages/shared/`](packages/shared/) | Shared types and validation contracts | Not started |
| [`infra/`](infra/) | Docker Compose and environment templates | Started |
| [`docs/`](docs/) | Specification, roadmap and operational docs | Started |

## Quick start (backend)

See [`apps/api/README.md`](apps/api/README.md) for a step-by-step guide, including
an explanation of how every part fits together.

```bash
cd apps/api
python3 -m venv .venv                 # create an isolated Python environment
source .venv/bin/activate             # use it in this terminal
pip install -e ".[dev]"               # install the app + dev tools
pytest                                # run the tests
alembic upgrade head                  # create the database tables
python -m app.cli create-admin --username you --email you@example.com --display-name "You"
uvicorn app.main:app --reload         # start the API on http://127.0.0.1:8000
```

Then open <http://127.0.0.1:8000/api/v1/docs> for interactive API documentation.

## Or run everything in Docker

```bash
cp infra/.env.example infra/.env      # then edit the passwords/secrets
docker compose -f infra/docker-compose.yml up --build
```
