"""One consistent error format for the whole API (spec §8).

Every error response looks like this, so the frontend only needs one way to
read errors::

    {"error": {"code": "invalid_credentials", "message": "...", "details": null}}

``code`` is stable and machine-readable (safe to use in ``if`` statements),
while ``message`` is human-readable and may change.
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Raise this anywhere in a route to return a clean JSON error."""

    def __init__(self, status_code: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def _body(code: str, message: str, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def register_error_handlers(app: FastAPI) -> None:
    """Tell FastAPI how to turn each kind of exception into a JSON response."""

    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=_body(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Turn Pydantic's detailed errors into a simple list of field problems.
        fields = [
            {
                "field": ".".join(str(part) for part in err["loc"] if part != "body"),
                "code": err["type"],
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=_body("validation_error", "Some fields are invalid.", fields),
        )

    @app.exception_handler(StaleDataError)
    async def handle_stale_data(_: Request, exc: StaleDataError) -> JSONResponse:
        # Two saves landed at nearly the same moment and the database's
        # "WHERE version = ?" check caught it (see services/versioning.py).
        return JSONResponse(
            status_code=409,
            content=_body(
                "version_conflict", "Someone else saved this record at the same time. Reload."
            ),
        )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        # A database rule (unique value, valid range...) rejected the data. Routes
        # check the common cases first with friendlier messages; this is the
        # safety net. The raw database message is not shown, as it can leak details.
        return JSONResponse(
            status_code=422,
            content=_body("constraint_violation", "The data breaks a database rule."),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # e.g. 404 for an unknown URL, 405 for a wrong HTTP method.
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(status_code=exc.status_code, content=_body(code, str(exc.detail)))
