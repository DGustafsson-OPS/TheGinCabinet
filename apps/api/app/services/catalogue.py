"""Rules for the gin catalogue: identity, botanicals and counts (spec §5 A02)."""

import uuid
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import IN_CABINET, Botanical, Bottle, Distillery, GinImage, GinProduct, MediaAsset
from app.schemas.catalogue import GinOut
from app.schemas.common import MediaSummary
from app.services.common import (
    apply_patch,
    ensure_slug_free,
    get_or_404,
    slugify,
    unique_slug,
)
from app.services.editorial import media_summary


def find_duplicate(
    db: Session, brand: str, name: str, edition: str, exclude_id: uuid.UUID | None = None
) -> GinProduct | None:
    """Find a gin with the same brand + name + edition, ignoring upper/lower case."""
    query = select(GinProduct).where(
        func.lower(GinProduct.brand) == brand.lower(),
        func.lower(GinProduct.name) == name.lower(),
        func.lower(GinProduct.edition) == edition.lower(),
    )
    if exclude_id is not None:
        query = query.where(GinProduct.id != exclude_id)
    return db.scalar(query)


def ensure_unique_identity(
    db: Session, brand: str, name: str, edition: str, exclude_id: uuid.UUID | None = None
) -> None:
    existing = find_duplicate(db, brand, name, edition, exclude_id)
    if existing:
        raise ApiError(
            422,
            "duplicate_gin",
            f"{existing.display_name} is already in the catalogue.",
            details={"existing_id": str(existing.id), "existing_slug": existing.slug},
        )


def botanicals_by_name(db: Session, names: list[str]) -> list[Botanical]:
    """Return Botanical rows for these names, creating any that don't exist yet."""
    if not names:
        return []
    existing = {b.name: b for b in db.scalars(select(Botanical).where(Botanical.name.in_(names)))}
    result = []
    for name in names:
        if name not in existing:
            existing[name] = Botanical(name=name)
            db.add(existing[name])
        result.append(existing[name])
    return result


def set_images(db: Session, gin: GinProduct, image_ids: list[uuid.UUID]) -> None:
    """Replace the gin's photos with these media ids, in this order.

    Photos that stay keep their existing row (only the position changes).
    Creating a fresh row for them would clash with the unique (gin, photo)
    rule, because the database inserts new rows before deleting old ones.
    """
    if len(set(image_ids)) != len(image_ids):
        raise ApiError(422, "duplicate_image", "The same photo is listed twice.")
    existing = {image.media_id: image for image in gin.images}
    rows = []
    for position, media_id in enumerate(image_ids):
        asset = db.get(MediaAsset, media_id)
        if asset is None or asset.deleted_at is not None:
            raise ApiError(422, "unknown_media", "A photo doesn't exist in the media library.")
        row = existing.get(media_id) or GinImage(media_id=media_id)
        row.position = position
        rows.append(row)
    gin.images = rows  # rows left out are deleted ("delete-orphan")


def check_distillery(db: Session, distillery_id: uuid.UUID | None) -> None:
    if distillery_id is not None:
        get_or_404(db, Distillery, distillery_id, "Distillery")


def create_gin(db: Session, data: dict[str, Any]) -> GinProduct:
    """Validate and add a new gin. ``data`` is a ``GinIn`` as a dict."""
    ensure_unique_identity(db, data["brand"], data["name"], data["edition"])
    check_distillery(db, data.get("distillery_id"))
    botanical_names = data.pop("botanicals", [])
    image_ids = data.pop("image_ids", [])
    if data.get("slug"):
        ensure_slug_free(db, GinProduct, data["slug"])
    else:
        base = slugify(" ".join(p for p in (data["brand"], data["name"], data["edition"]) if p))
        data["slug"] = unique_slug(db, GinProduct, base)
    gin = GinProduct(**data)  # `**data` passes each dict key as a keyword argument
    gin.botanicals = botanicals_by_name(db, botanical_names)
    db.add(gin)
    set_images(db, gin, image_ids)
    return gin


def apply_gin_changes(db: Session, gin: GinProduct, changes: dict[str, Any]) -> None:
    """Apply a PATCH to an existing gin."""
    brand = changes.get("brand", gin.brand)
    name = changes.get("name", gin.name)
    edition = changes.get("edition", gin.edition)
    if edition is None:
        edition = changes["edition"] = ""
    if {"brand", "name", "edition"} & changes.keys():
        ensure_unique_identity(db, brand, name, edition, exclude_id=gin.id)
    if "distillery_id" in changes:
        check_distillery(db, changes["distillery_id"])
    if changes.get("slug"):
        ensure_slug_free(db, GinProduct, changes["slug"], exclude_id=gin.id)
    if "botanicals" in changes:
        gin.botanicals = botanicals_by_name(db, changes.pop("botanicals") or [])
    if "image_ids" in changes:
        set_images(db, gin, changes.pop("image_ids") or [])
    apply_patch(
        gin, changes, never_empty={"brand", "name", "slug", "style", "abv", "public_visible"}
    )


def bottle_counts(db: Session, gin_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, int]]:
    """For each gin: (bottles in cabinet, bottles ever), in a single query."""
    if not gin_ids:
        return {}
    rows = db.execute(
        select(
            Bottle.gin_id,
            func.sum(case((Bottle.status.in_(IN_CABINET), 1), else_=0)),
            func.count(),
        )
        .where(Bottle.gin_id.in_(gin_ids))
        .group_by(Bottle.gin_id)
    ).all()
    return {gin_id: (int(in_cabinet or 0), int(total)) for gin_id, in_cabinet, total in rows}


def gin_images(gin: GinProduct) -> list[MediaSummary]:
    """The gin's photos as MediaSummary, skipping any deleted image."""
    return [s for s in (media_summary(image.media) for image in gin.images) if s is not None]


def gin_out(gin: GinProduct, counts: tuple[int, int] = (0, 0)) -> GinOut:
    out = GinOut.model_validate(gin)
    return out.model_copy(
        update={
            "bottles_in_cabinet": counts[0],
            "bottles_total": counts[1],
            "images": gin_images(gin),
        }
    )


def gin_out_with_counts(db: Session, gin: GinProduct) -> GinOut:
    return gin_out(gin, bottle_counts(db, [gin.id]).get(gin.id, (0, 0)))
