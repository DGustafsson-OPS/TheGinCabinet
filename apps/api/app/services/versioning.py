"""Optimistic concurrency: the "two-person edit conflict" workflow (spec §6).

The scenario: Anna and Bertil both open the same gin (version 3). Bertil saves
first (now version 4). When Anna saves, her request still says "version 3".
Instead of silently overwriting Bertil's work, the API answers
**409 Conflict** with the current record and a diff, so the UI can show both
versions. Anna can then retry with ``?force=true``, a deliberate choice.

It is "optimistic" because we don't lock anything while people edit; we only
check for a clash at save time, which suits a two-person site.
"""

from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import BaseModel

from app.errors import ApiError


def _jsonable(value: Any) -> Any:
    """Make values like Decimal, date and UUID JSON-friendly strings."""
    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    return str(value)


def _same(yours: Any, current: Any) -> bool:
    """Compare a sent value with the stored one; numbers by value ("41.4" == "41.40")."""
    if isinstance(yours, Decimal | int | float) and not isinstance(yours, bool) and current:
        try:
            return Decimal(str(yours)) == Decimal(str(current))
        except InvalidOperation:
            return False
    return _jsonable(yours) == current


def check_version(
    *,
    current_version: int,
    sent_version: int,
    force: bool,
    changes: dict[str, Any],
    current: BaseModel,
) -> None:
    """Raise 409 if the client edited an out-of-date copy (unless ``force``).

    ``changes`` are the fields the client wants to set; ``current`` is the
    record as it is now, already converted to its response schema.
    """
    if force or sent_version == current_version:
        return
    current_data = current.model_dump(mode="json")
    diff = {
        field: {"yours": _jsonable(value), "current": current_data.get(field)}
        for field, value in changes.items()
        if not _same(value, current_data.get(field))
    }
    raise ApiError(
        409,
        "version_conflict",
        "Someone else saved this record after you opened it.",
        details={"current": current_data, "diff": diff},
    )
