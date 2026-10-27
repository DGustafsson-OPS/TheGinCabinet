"""Page texts: the fixed wording on the home and About pages (Admin → Page texts).

Admins and editors may change them; it's content, like an article. Each save
is checked against the version you loaded, so two people editing the same
text get a conflict instead of one silently overwriting the other.
"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.errors import ApiError
from app.models import PageText
from app.schemas.blog import check_links
from app.schemas.site_content import PageTextOut, PageTextPatch
from app.services import audit, page_texts
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/page-texts", tags=["admin: page texts"])

Force = Annotated[bool, Query(description="Overwrite even if the text changed meanwhile")]


def _out(definition: page_texts.PageTextDef, row: PageText | None) -> PageTextOut:
    return PageTextOut(
        key=definition.key,
        page=definition.page,
        label=definition.label,
        hint=definition.hint,
        formatted=definition.formatted,
        max_length=definition.max_length,
        default=definition.default,
        value=row.value if row else definition.default,
        customised=row is not None,
        version=row.version if row else 0,
        updated_at=row.updated_at if row else None,
        updated_by=row.updated_by.display_name if row and row.updated_by else None,
    )


def _definition(key: str) -> page_texts.PageTextDef:
    definition = page_texts.BY_KEY.get(key)
    if definition is None:
        raise ApiError(404, "not_found", "There is no page text with that name.")
    return definition


@router.get("", response_model=list[PageTextOut])
def list_page_texts(staff: CurrentStaff, db: DbSession):
    rows = page_texts.stored(db)
    return [_out(d, rows.get(d.key)) for d in page_texts.PAGE_TEXTS]


@router.patch("/{key}", response_model=PageTextOut)
def update_page_text(
    key: str, body: PageTextPatch, staff: CurrentStaffWrite, db: DbSession, force: Force = False
):
    definition = _definition(key)
    value = body.value.strip()
    if not value:
        raise ApiError(422, "validation_error", "The text can't be empty.")
    if len(value) > definition.max_length:
        raise ApiError(
            422, "validation_error", f"Keep it under {definition.max_length} characters."
        )
    if definition.formatted:
        try:
            check_links(value)
        except ValueError as error:
            raise ApiError(422, "validation_error", str(error)) from None
    elif "\n" in value:
        raise ApiError(422, "validation_error", "This text must be a single line.")

    row = db.get(PageText, key)
    check_version(
        current_version=row.version if row else 0,
        sent_version=body.version,
        force=force,
        changes={"value": value},
        current=_out(definition, row),
    )
    if row is None:
        row = PageText(key=key, value=value, updated_by_id=staff.user.id)
        db.add(row)
    else:
        row.value = value
        row.updated_by_id = staff.user.id
    audit.record(
        db,
        action="page_text.update",
        entity_type="page_text",
        entity_id=key,
        actor_id=staff.user.id,
        summary={"key": key, "title": definition.label},
    )
    db.commit()
    db.refresh(row)
    return _out(definition, row)


@router.delete("/{key}", response_model=PageTextOut)
def reset_page_text(key: str, staff: CurrentStaffWrite, db: DbSession, version: int = Query()):
    """Go back to the default wording (the UI asks for confirmation first)."""
    definition = _definition(key)
    row = db.get(PageText, key)
    if row is None:
        return _out(definition, None)
    if row.version != version:
        raise ApiError(
            409, "version_conflict", "Someone changed this text meanwhile. Reload first."
        )
    db.delete(row)
    audit.record(
        db,
        action="page_text.reset",
        entity_type="page_text",
        entity_id=key,
        actor_id=staff.user.id,
        summary={"key": key, "title": definition.label},
    )
    db.commit()
    return _out(definition, None)
