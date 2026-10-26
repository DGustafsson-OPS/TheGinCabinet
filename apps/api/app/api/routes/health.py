"""Health check (spec §9, §10B). Coolify and Docker call this to see if the API is alive."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import DbSession

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: DbSession) -> JSONResponse:
    """Return 200 if the API *and* the database respond, 503 otherwise."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # any database problem means "not healthy"
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})
    return JSONResponse(content={"status": "ok", "database": "ok"})
