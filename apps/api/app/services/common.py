"""Small helpers used by many routes."""

import re
import unicodedata
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Collection
from app.models._types import utcnow


def get_or_404[ModelT](
    db: Session, model: type[ModelT], entity_id: uuid.UUID, label: str
) -> ModelT:
    """Load a row by primary key, or stop the request with a clean 404."""
    obj = db.get(model, entity_id)
    if obj is None:
        raise ApiError(404, "not_found", f"{label} not found.")
    return obj


def collection_id(db: Session) -> uuid.UUID:
    """The id of the one shared collection (spec §1). Created if missing."""
    existing = db.scalar(select(Collection.id).limit(1))
    if existing:
        return existing
    collection = Collection(name="The Gin Cabinet")
    db.add(collection)
    db.flush()
    return collection.id


def contains(column, text: str):
    """Case-insensitive "column contains text" condition for a query.

    ``%`` and ``_`` are wildcards in SQL LIKE, so we escape them: searching for
    "50%" should find "50%", not everything.
    """
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{escaped}%", escape="\\")


def slugify(text: str) -> str:
    """Turn "Hendrick's Gin – Orbium" into "hendricks-gin-orbium".

    ``unicodedata.normalize("NFKD", ...)`` splits "é" into "e" + an accent mark;
    encoding to ASCII with "ignore" then drops the accent.
    """
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    ascii_text = ascii_text.replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:150] or "item"


def unique_slug(db: Session, model, base: str, exclude_id: uuid.UUID | None = None) -> str:
    """Return ``base``, or ``base-2``, ``base-3``... whichever is still free."""
    candidate, n = base, 1
    while True:
        query = select(func.count()).select_from(model).where(model.slug == candidate)
        if exclude_id is not None:
            query = query.where(model.id != exclude_id)
        if not db.scalar(query):
            return candidate
        n += 1
        candidate = f"{base}-{n}"


def ensure_slug_free(db: Session, model, slug: str, exclude_id: uuid.UUID | None = None) -> None:
    """For slugs typed by a person: refuse a taken one instead of renaming it."""
    if unique_slug(db, model, slug, exclude_id) != slug:
        raise ApiError(422, "slug_taken", f"The slug {slug!r} is already used.")


def apply_patch(entity, changes: dict, never_empty: set[str] = frozenset()) -> None:
    """Copy the sent fields onto a database object.

    ``never_empty`` lists required fields: sending ``null`` for them is ignored.
    We always refresh ``updated_at`` so the row's ``version`` goes up even when
    only related rows changed.
    """
    for field, value in changes.items():
        if value is None and field in never_empty:
            continue
        setattr(entity, field, value)  # same as entity.<field> = value
    entity.updated_at = utcnow()
