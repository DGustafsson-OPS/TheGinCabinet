"""Media library (spec §8: POST /api/v1/admin/media, §5 A09) and image serving.

Images have a readable name and can be filed in folders ("Gins/Hernö"; see
services/media_library.py). Several images can be changed at once with
``POST /admin/media/bulk``: move to a folder, rename as a numbered series,
set the credit, switch the watermark or "AI-generated" label on or off, or
delete (images still in use are skipped and listed).
"""

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
from app.schemas.editorial import (
    BulkSkipped,
    FolderRename,
    MediaBulk,
    MediaBulkResult,
    MediaFolder,
    MediaOut,
    MediaPatch,
)
from app.services import audit, media
from app.services.common import apply_patch, contains, get_or_404
from app.services.editorial import media_out, media_usage
from app.services.media_library import clean_folder, name_from_filename
from app.services.site import get_site_settings
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/media", tags=["admin: media"])
files_router = APIRouter(tags=["media files"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


def _site_name(db) -> str:
    return get_site_settings(db).site_name


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
    name: Annotated[str | None, Form(max_length=160)] = None,
    folder: Annotated[str | None, Form(max_length=300)] = None,
    watermark: Annotated[bool, Form()] = False,
    ai_generated: Annotated[bool, Form()] = False,
):
    """Upload an image. It is checked, cleaned of metadata and stored under a random name.

    ``watermark`` / ``ai_generated`` put the small corner marks on it straight away.
    """
    # Read at most one byte more than allowed: enough to know it's too big.
    raw = file.file.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    processed = media.process_image(raw)
    asset = MediaAsset(
        storage_key=media.store(processed),
        original_filename=(file.filename or "")[:255] or None,
        name=(name or "").strip() or name_from_filename(file.filename),
        folder=clean_folder(folder),
        mime=processed.mime,
        width=processed.width,
        height=processed.height,
        size_bytes=len(processed.data),
        alt=(alt or "").strip() or None,
        credit=(credit or "").strip() or None,
        uploaded_by_id=admin.user.id,
        watermark=watermark,
        ai_generated=ai_generated,
    )
    if watermark or ai_generated:
        media.refresh_marks(asset, _site_name(db))
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
    folder: str | None = Query(
        default=None, description='A folder path; "/" = images not in any folder'
    ),
    subfolders: bool = False,
):
    query = select(MediaAsset).where(MediaAsset.deleted_at.is_(None))
    if folder == "/":
        query = query.where(MediaAsset.folder.is_(None))
    elif folder:
        path = clean_folder(folder)
        where = MediaAsset.folder == path
        if subfolders:
            where = or_(where, MediaAsset.folder.startswith(f"{path}/", autoescape=True))
        query = query.where(where)
    if search:
        query = query.where(
            or_(
                contains(MediaAsset.name, search),
                contains(MediaAsset.folder, search),
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


@router.get("/folders", response_model=list[MediaFolder])
def list_folders(admin: CurrentStaff, db: DbSession):
    """Every folder in use, with the parent folders of subfolders included."""
    rows = db.execute(
        select(MediaAsset.folder, func.count())
        .where(MediaAsset.deleted_at.is_(None), MediaAsset.folder.is_not(None))
        .group_by(MediaAsset.folder)
    ).all()
    counts: dict[str, int] = {}
    for path, count in rows:
        parts = path.split("/")
        for depth in range(1, len(parts)):  # "Gins/Hernö" also lists "Gins"
            counts.setdefault("/".join(parts[:depth]), 0)
        counts[path] = counts.get(path, 0) + count
    return [
        MediaFolder(path=p, count=c) for p, c in sorted(counts.items(), key=lambda i: i[0].lower())
    ]


@router.post("/folders/rename", response_model=MediaBulkResult)
def rename_folder(body: FolderRename, admin: CurrentStaffWrite, db: DbSession):
    """Rename or move a folder, with all its subfolders ("Gin" -> "Gins")."""
    old = clean_folder(body.from_path)
    new = clean_folder(body.to_path)
    if old is None:
        raise ApiError(422, "validation_error", "Choose a folder to rename.")
    if new and (new == old or new.startswith(f"{old}/")):
        raise ApiError(422, "validation_error", "A folder can't be moved into itself.")
    assets = db.scalars(
        select(MediaAsset).where(
            MediaAsset.deleted_at.is_(None),
            or_(MediaAsset.folder == old, MediaAsset.folder.startswith(f"{old}/", autoescape=True)),
        )
    ).all()
    for asset in assets:
        rest = asset.folder[len(old) :].lstrip("/")
        asset.folder = clean_folder("/".join(p for p in (new or "", rest) if p))
        asset.updated_at = utcnow()
    audit.record(
        db,
        action="media.folder_rename",
        entity_type="media",
        actor_id=admin.user.id,
        summary={"from": old, "to": new, "images": len(assets)},
    )
    db.commit()
    return MediaBulkResult(changed=len(assets))


@router.post("/bulk", response_model=MediaBulkResult)
def bulk_change(body: MediaBulk, admin: CurrentStaffWrite, db: DbSession):
    """Change many images at once. Images are taken in the order sent."""
    found = {
        a.id: a
        for a in db.scalars(
            select(MediaAsset).where(MediaAsset.id.in_(body.ids), MediaAsset.deleted_at.is_(None))
        )
    }
    assets = [found[i] for i in dict.fromkeys(body.ids) if i in found]  # keep order, no repeats
    skipped: list[BulkSkipped] = []
    replaced: list[str | None] = []  # marked copies to delete once saved
    changed = 0
    if body.action == "move":
        folder = clean_folder(body.folder)
        for asset in assets:
            asset.folder = folder
    elif body.action == "rename":
        base = " ".join((body.base_name or "").split())
        if not base:
            raise ApiError(422, "validation_error", "Give the new name.")
        for number, asset in enumerate(assets, start=body.start):
            asset.name = f"{base} {number}" if len(assets) > 1 else base
    elif body.action == "credit":
        credit = (body.credit or "").strip() or None
        for asset in assets:
            asset.credit = credit
    elif body.action in ("watermark", "ai_generated"):
        if body.on is None:
            raise ApiError(422, "validation_error", "Say whether to switch the mark on or off.")
        site_name = _site_name(db)
        for asset in assets:
            setattr(asset, body.action, body.on)
            replaced.append(media.refresh_marks(asset, site_name))
    elif body.action == "delete":
        for asset in list(assets):
            used_by = media_usage(db, asset.id)
            if used_by:
                skipped.append(
                    BulkSkipped(
                        id=asset.id,
                        name=asset.name or asset.original_filename,
                        reason="Still used in: " + ", ".join(used_by),
                    )
                )
                assets.remove(asset)
            else:
                asset.deleted_at = utcnow()
    for asset in assets:
        asset.updated_at = utcnow()  # also raises the version, so open edit forms notice
        changed += 1
    audit.record(
        db,
        action=f"media.bulk_{body.action}",
        entity_type="media",
        actor_id=admin.user.id,
        summary={"images": changed, "skipped": len(skipped)},
    )
    db.commit()
    for key in replaced:
        media.remove(key)
    return MediaBulkResult(changed=changed, skipped=skipped)


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
    if "folder" in changes:
        changes["folder"] = clean_folder(changes["folder"])
    if "name" in changes:
        changes["name"] = " ".join((changes["name"] or "").split()) or None
    marks_before = (asset.watermark, asset.ai_generated)
    apply_patch(asset, changes, never_empty={"decorative", "watermark", "ai_generated"})
    replaced = None
    if (asset.watermark, asset.ai_generated) != marks_before:
        replaced = media.refresh_marks(asset, _site_name(db))
    audit.record(
        db,
        action="media.update",
        entity_type="media",
        entity_id=asset.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    media.remove(replaced)  # the old marked copy, once the new state is saved
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
    where = or_(MediaAsset.storage_key == key, MediaAsset.display_key == key)
    asset = db.scalar(select(MediaAsset).where(where)) if path else None
    # While an image is marked, only the marked copy is served: the unmarked
    # original would otherwise still be reachable at its old address.
    hidden = asset is not None and asset.display_key and key == asset.storage_key
    if path is None or asset is None or asset.deleted_at is not None or hidden:
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
