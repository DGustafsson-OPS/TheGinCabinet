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
# A dedicated user without root rights runs the app.
RUN useradd --create-home --uid 10001 gin
WORKDIR /app
COPY --from=build /venv /venv
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
USER gin

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# --proxy-headers: trust X-Forwarded-For from the reverse proxy so we see real
# client IPs. FORWARDED_ALLOW_IPS limits which proxy addresses are trusted.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\""]
