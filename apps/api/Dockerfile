# Production image for the FastAPI backend (spec §10B "Repository and build conventions":
# pinned runtime major version, multi-stage build, non-root user, /health endpoint).
#
# Build from the repository root:   docker build -t gin-cabinet-api apps/api

# ---- Stage 1: install dependencies into a virtual environment ----
FROM python:3.13-slim AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN python -m venv /venv
COPY pyproject.toml ./
COPY app ./app
# Production-only dependencies: the [dev] extras (pytest, ruff) are not installed.
RUN /venv/bin/pip install .

# ---- Stage 2: the small runtime image ----
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:$PATH" \
    GC_ENVIRONMENT=production \
    GC_COOKIE_SECURE=true
# curl: Coolify's generated HTTP health check runs curl (or wget) inside the
# container, so the image must include one of them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
# A dedicated user without root rights runs the app.
RUN useradd --create-home --uid 10001 gin
WORKDIR /app
COPY --from=build /venv /venv
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
# Uploaded images will live here, on a Docker volume. Creating the folder now,
# owned by `gin`, means the non-root app can write to that volume.
RUN mkdir -p /app/media && chown gin:gin /app/media
USER gin

EXPOSE 8000
# start-period: room for the database migrations that run at start-up (below).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# Start-up, in order:
# 1. Bring the database schema up to date (`alembic upgrade head`; does nothing
#    if it already is). The new container only passes its health check, and
#    so only receives traffic, after this has succeeded. If it fails, the
#    container stops and Coolify keeps the old version running.
#    Set GC_MIGRATE_ON_START=false to run migrations some other way.
# 2. Start the API. `exec` makes uvicorn the main process so it receives the
#    stop signal directly and shuts down cleanly.
#    --proxy-headers: trust X-Forwarded-For from the reverse proxy so we see
#    real client IPs. FORWARDED_ALLOW_IPS limits which proxies are trusted.
CMD ["sh", "-c", "if [ \"${GC_MIGRATE_ON_START:-true}\" = true ]; then alembic upgrade head || exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\""]
