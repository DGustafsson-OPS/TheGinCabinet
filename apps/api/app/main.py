"""The FastAPI application: the entry point that wires everything together.

Run it locally with::

    uvicorn app.main:app --reload

``app.main:app`` means "the variable ``app`` in the module ``app/main.py``".
"""

from fastapi import FastAPI

from app.api.routes import (
    admin_audit,
    admin_catalogue,
    admin_dashboard,
    admin_data,
    admin_inventory,
    auth,
    health,
)
from app.config import get_settings
from app.errors import register_error_handlers

API_PREFIX = "/api/v1"  # spec §8: versioned contracts


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
    return app


app = create_app()
