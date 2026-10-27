"""Media library (spec §8: POST /api/v1/admin/media, §5 A09) and image serving."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.config import get_settings
from app.errors import ApiError
from app.models import MediaAsset
from app.models._types import utcnow
from app.schemas.common import Page, PageParams
from app.schemas.editorial import MediaOut, MediaPatch
from app.services import audit, media
from app.services.common import apply_patch, contains, get_or_404
from app.services.editorial import media_out, media_usage
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/media", tags=["admin: media"])
files_router = APIRouter(tags=["media files"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


def _get_live(db: DbSession, media_id: uuid.UUID) -> MediaAsset:
    asset = get_or_404(db, MediaAsset, media_id, "Image")
    if asset.deleted_at is not None:
        raise ApiError(404, "not_found", "Image not found.")
    return asset


@router.post("", response_model=MediaOut, status_code=201)
def upload(
    admin: CurrentStaffWrite,
    db: DbSession,
    file: Annotated[UploadFile, File(description="JPEG, PNG or WebP")],
    alt: Annotated[str | None, Form(max_length=500)] = None,
    credit: Annotated[str | None, Form(max_length=200)] = None,
):
    """Upload an image. It is checked, cleaned of metadata and stored under a random name."""
    # Read at most one byte more than allowed: enough to know it's too big.
    raw = file.file.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    processed = media.process_image(raw)
    asset = MediaAsset(
        storage_key=media.store(processed),
        original_filename=(file.filename or "")[:255] or None,
        mime=processed.mime,
        width=processed.width,
        height=processed.height,
        size_bytes=len(processed.data),
        alt=(alt or "").strip() or None,
        credit=(credit or "").strip() or None,
        uploaded_by_id=admin.user.id,
    )
    db.add(asset)
    db.flush()
    audit.record(
        db,
        action="media.upload",
        entity_type="media",
        entity_id=asset.id,
        actor_id=admin.user.id,
        summary={"mime": asset.mime, "bytes": asset.size_bytes},
    )
    db.commit()
    return media_out(db, asset)


@router.get("", response_model=Page[MediaOut])
def list_media(
    admin: CurrentStaff,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
):
    query = select(MediaAsset).where(MediaAsset.deleted_at.is_(None))
    if search:
        query = query.where(
            or_(
                contains(MediaAsset.alt, search),
                contains(MediaAsset.original_filename, search),
                contains(MediaAsset.credit, search),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(MediaAsset.created_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).all()
    return Page[MediaOut](items=[media_out(db, a) for a in rows], meta=paging.meta(total))


@router.get("/{media_id}", response_model=MediaOut)
def get_media(media_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    return media_out(db, _get_live(db, media_id))


@router.patch("/{media_id}", response_model=MediaOut)
def update_media(
    media_id: uuid.UUID,
    body: MediaPatch,
    admin: CurrentStaffWrite,
    db: DbSession,
    force: Force = False,
):
    asset = _get_live(db, media_id)
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=asset.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=media_out(db, asset),
    )
    apply_patch(asset, changes, never_empty={"decorative"})
    audit.record(
        db,
        action="media.update",
        entity_type="media",
        entity_id=asset.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    return media_out(db, asset)


@router.delete("/{media_id}", status_code=204)
def delete_media(media_id: uuid.UUID, admin: CurrentStaffWrite, db: DbSession):
    """Soft-delete an image, but only when nothing uses it (spec A09)."""
    asset = _get_live(db, media_id)
    used_by = media_usage(db, asset.id)
    if used_by:
        raise ApiError(
            409,
            "media_in_use",
            "This image is still used. Remove it from these first.",
            details={"used_by": used_by},
        )
    asset.deleted_at = utcnow()
    audit.record(
        db,
        action="media.delete",
        entity_type="media",
        entity_id=asset.id,
        actor_id=admin.user.id,
        summary={"file": asset.original_filename},
    )
    db.commit()


@files_router.get("/api/v1/media/{key}")
def serve_file(key: str, db: DbSession):
    """Send an image file. File names are random and unguessable."""
    path = media.path_for(key)
    asset = db.scalar(select(MediaAsset).where(MediaAsset.storage_key == key)) if path else None
    if path is None or asset is None or asset.deleted_at is not None:
        raise ApiError(404, "not_found", "Image not found.")
    return FileResponse(
        path,
        media_type=asset.mime,
        headers={
            # The content of a key never changes, so browsers may keep it for a year.
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
