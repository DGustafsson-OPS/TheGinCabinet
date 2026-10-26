"""The FastAPI application: the entry point that wires everything together.

Run it locally with::

    uvicorn app.main:app --reload

``app.main:app`` means "the variable ``app`` in the module ``app/main.py``".
"""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import (
    admin_audit,
    admin_blog,
    admin_catalogue,
    admin_cocktails,
    admin_dashboard,
    admin_data,
    admin_inventory,
    admin_media,
    admin_reviews,
    admin_settings,
    admin_tastings,
    admin_users,
    auth,
    health,
    public_blog,
    public_catalogue,
    public_cocktails,
    public_reviews,
    public_site,
)
from app.config import get_settings
from app.db import SessionLocal
from app.errors import register_error_handlers
from app.services.maintenance import run_jobs

API_PREFIX = "/api/v1"  # spec §8: versioned contracts

log = logging.getLogger(__name__)


def _run_jobs_once() -> None:
    with SessionLocal() as db:
        run_jobs(db)


async def _job_loop(interval: int) -> None:
    """Run the periodic jobs forever, every ``interval`` seconds.

    The jobs use the normal (blocking) database code, so ``asyncio.to_thread``
    runs them in a worker thread and the API keeps answering requests.
    """
    while True:
        try:
            await asyncio.to_thread(_run_jobs_once)
        except Exception:  # one failed run must not stop the timer
            log.exception("Periodic jobs failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Code before ``yield`` runs when the server starts; after it, when it stops."""
    settings = get_settings()
    task = None
    if settings.scheduler_enabled:
        task = asyncio.create_task(_job_loop(settings.scheduler_interval_seconds))
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    is_production = settings.environment == "production"

    app = FastAPI(
        title="The Gin Cabinet API",
        version="0.1.0",
        # The interactive docs at /api/docs are handy in development but
        # reveal the whole API surface, so they are switched off in production.
        docs_url=None if is_production else f"{API_PREFIX}/docs",
        redoc_url=None,
        lifespan=lifespan,
        openapi_url=None if is_production else f"{API_PREFIX}/openapi.json",
    )
    register_error_handlers(app)

    app.include_router(health.router)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(admin_audit.router, prefix=API_PREFIX)
    app.include_router(admin_dashboard.router, prefix=API_PREFIX)
    app.include_router(admin_catalogue.router, prefix=API_PREFIX)
    app.include_router(admin_inventory.router, prefix=API_PREFIX)
    app.include_router(admin_data.router, prefix=API_PREFIX)
    app.include_router(admin_users.router, prefix=API_PREFIX)
    app.include_router(admin_media.router, prefix=API_PREFIX)
    app.include_router(admin_media.files_router)  # its path already starts with /api/v1
    app.include_router(admin_tastings.router, prefix=API_PREFIX)
    app.include_router(admin_reviews.router, prefix=API_PREFIX)
    app.include_router(public_reviews.router, prefix=API_PREFIX)
    app.include_router(admin_cocktails.router, prefix=API_PREFIX)
    app.include_router(public_cocktails.router, prefix=API_PREFIX)
    app.include_router(public_catalogue.router, prefix=API_PREFIX)
    app.include_router(admin_blog.router, prefix=API_PREFIX)
    app.include_router(public_blog.router, prefix=API_PREFIX)
    app.include_router(admin_settings.router, prefix=API_PREFIX)
    app.include_router(public_site.router, prefix=API_PREFIX)
    return app


app = create_app()
