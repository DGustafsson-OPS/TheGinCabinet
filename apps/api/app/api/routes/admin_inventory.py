"""Admin inventory: bottles, purchases and wishlist (spec §8, §5 A03, A04, A08)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.errors import ApiError
from app.models import (
    IN_CABINET,
    Bottle,
    BottleStatus,
    GinProduct,
    Purchase,
    WishlistItem,
    WishlistStatus,
)
from app.schemas.common import Page, PageParams
from app.schemas.inventory import (
    BottleDetailOut,
    BottleIn,
    BottleOut,
    BottlePatch,
    BottleStatusChange,
    PurchaseIn,
    PurchaseOut,
    PurchasePatch,
    WishlistConvert,
    WishlistIn,
    WishlistOut,
    WishlistPatch,
)
from app.services import audit
from app.services.common import apply_patch, contains, get_or_404
from app.services.inventory import (
    add_bottle,
    change_status,
    create_purchase,
    purchase_out,
    update_level,
)
from app.services.versioning import check_version

router = APIRouter(prefix="/admin", tags=["admin: inventory"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]
Paging = Annotated[PageParams, Depends()]


# ---------------- Bottles ----------------


@router.get("/bottles", response_model=Page[BottleOut])
def list_bottles(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Paging,
    gin_id: uuid.UUID | None = None,
    status: BottleStatus | None = None,
    in_cabinet: bool | None = Query(default=None, description="Only sealed + open bottles"),
    search: str | None = None,
):
    query = select(Bottle).join(Bottle.gin)
    if gin_id:
        query = query.where(Bottle.gin_id == gin_id)
    if status:
        query = query.where(Bottle.status == status)
    if in_cabinet:
        query = query.where(Bottle.status.in_(IN_CABINET))
    if search:
        query = query.where(
            or_(
                contains(GinProduct.brand, search),
                contains(GinProduct.name, search),
                contains(Bottle.shelf, search),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Bottle.created_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).all()
    return Page[BottleOut](
        items=[BottleOut.model_validate(b) for b in rows], meta=paging.meta(total)
    )


@router.post("/bottles", response_model=list[BottleOut], status_code=201)
def create_bottles(body: BottleIn, admin: CurrentAdminWrite, db: DbSession):
    """Add one or more identical bottles that weren't bought via a recorded purchase."""
    get_or_404(db, GinProduct, body.gin_id, "Gin")
    bottles = [
        add_bottle(
            db,
            gin_id=body.gin_id,
            size_ml=body.size_ml,
            actor_id=admin.user.id,
            status=body.status,
            remaining_ml=body.remaining_ml,
            shelf=body.shelf,
            source=body.source,
            acquired_on=body.acquired_on,
            comments=body.comments,
        )
        for _ in range(body.quantity)
    ]
    audit.record(
        db,
        action="bottle.create",
        entity_type="gin",
        entity_id=body.gin_id,
        actor_id=admin.user.id,
        summary={"quantity": body.quantity, "size_ml": body.size_ml},
    )
    db.commit()
    return [BottleOut.model_validate(b) for b in bottles]


@router.get("/bottles/{bottle_id}", response_model=BottleDetailOut)
def get_bottle(bottle_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return get_or_404(db, Bottle, bottle_id, "Bottle")


@router.patch("/bottles/{bottle_id}", response_model=BottleDetailOut)
def update_bottle(
    bottle_id: uuid.UUID,
    body: BottlePatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    bottle = get_or_404(db, Bottle, bottle_id, "Bottle")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=bottle.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=BottleOut.model_validate(bottle),
    )
    new_level = changes.pop("remaining_ml", None)
    if new_level is not None:
        update_level(db, bottle, new_level, admin.user.id)
    apply_patch(bottle, changes)
    audit.record(
        db,
        action="bottle.update",
        entity_type="bottle",
        entity_id=bottle.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(body.model_fields_set - {"version"})},
    )
    db.commit()
    db.refresh(bottle)  # reload, so the response includes the new history entry
    return bottle


@router.post("/bottles/{bottle_id}/status", response_model=BottleDetailOut)
def change_bottle_status(
    bottle_id: uuid.UUID, body: BottleStatusChange, admin: CurrentAdminWrite, db: DbSession
):
    """Open, finish, gift or dispose of a bottle. The history is kept (spec §6)."""
    bottle = get_or_404(db, Bottle, bottle_id, "Bottle")
    check_version(
        current_version=bottle.version,
        sent_version=body.version,
        force=False,
        changes={"status": body.status},
        current=BottleOut.model_validate(bottle),
    )
    old_status = bottle.status
    change_status(
        db,
        bottle,
        new_status=body.status,
        actor_id=admin.user.id,
        remaining_ml=body.remaining_ml,
        on=body.on,
        note=body.note,
    )
    audit.record(
        db,
        action="bottle.status",
        entity_type="bottle",
        entity_id=bottle.id,
        actor_id=admin.user.id,
        summary={"from": old_status, "to": body.status},
    )
    db.commit()
    db.refresh(bottle)
    return bottle


# ---------------- Purchases ----------------


@router.get("/purchases", response_model=Page[PurchaseOut])
def list_purchases(admin: CurrentAdmin, db: DbSession, paging: Paging, search: str | None = None):
    query = select(Purchase)
    if search:
        query = query.where(
            or_(contains(Purchase.retailer, search), contains(Purchase.reference, search))
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Purchase.purchased_on.desc(), Purchase.created_at.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return Page[PurchaseOut](items=[purchase_out(p) for p in rows], meta=paging.meta(total))


@router.post("/purchases", response_model=PurchaseOut, status_code=201)
def create_purchase_route(body: PurchaseIn, admin: CurrentAdminWrite, db: DbSession):
    purchase = create_purchase(db, body, admin.user.id)
    audit.record(
        db,
        action="purchase.create",
        entity_type="purchase",
        entity_id=purchase.id,
        actor_id=admin.user.id,
        summary={
            "retailer": purchase.retailer,
            "bottles": sum(line.quantity for line in purchase.lines),
        },
    )
    db.commit()
    return purchase_out(purchase)


@router.get("/purchases/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return purchase_out(get_or_404(db, Purchase, purchase_id, "Purchase"))


@router.patch("/purchases/{purchase_id}", response_model=PurchaseOut)
def update_purchase(
    purchase_id: uuid.UUID,
    body: PurchasePatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    purchase = get_or_404(db, Purchase, purchase_id, "Purchase")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=purchase.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=purchase_out(purchase),
    )
    apply_patch(purchase, changes, never_empty={"purchased_on", "retailer", "currency"})
    audit.record(
        db,
        action="purchase.update",
        entity_type="purchase",
        entity_id=purchase.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes), "forced": force},
    )
    db.commit()
    return purchase_out(purchase)


# ---------------- Wishlist (private) ----------------


@router.get("/wishlist", response_model=Page[WishlistOut])
def list_wishlist(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Paging,
    status: WishlistStatus | None = WishlistStatus.WANTED,
):
    query = select(WishlistItem)
    if status:
        query = query.where(WishlistItem.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(WishlistItem.priority, WishlistItem.created_at)
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return Page[WishlistOut](
        items=[WishlistOut.model_validate(w) for w in rows], meta=paging.meta(total)
    )


@router.post("/wishlist", response_model=WishlistOut, status_code=201)
def create_wishlist_item(body: WishlistIn, admin: CurrentAdminWrite, db: DbSession):
    data = body.model_dump()
    if body.gin_id:
        gin = get_or_404(db, GinProduct, body.gin_id, "Gin")
        data["text"] = (data["text"] or "").strip() or gin.display_name
    item = WishlistItem(**data, added_by_id=admin.user.id)
    db.add(item)
    db.flush()
    audit.record(
        db,
        action="wishlist.create",
        entity_type="wishlist_item",
        entity_id=item.id,
        actor_id=admin.user.id,
        summary={"text": item.text},
    )
    db.commit()
    db.refresh(item)
    return item


@router.patch("/wishlist/{item_id}", response_model=WishlistOut)
def update_wishlist_item(
    item_id: uuid.UUID,
    body: WishlistPatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    item = get_or_404(db, WishlistItem, item_id, "Wishlist item")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=item.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=WishlistOut.model_validate(item),
    )
    if item.status == WishlistStatus.PURCHASED and "status" in changes:
        raise ApiError(422, "already_purchased", "This item has already been bought.")
    if changes.get("gin_id"):
        get_or_404(db, GinProduct, changes["gin_id"], "Gin")
    apply_patch(item, changes, never_empty={"text", "priority", "status"})
    audit.record(
        db,
        action="wishlist.update",
        entity_type="wishlist_item",
        entity_id=item.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes), "forced": force},
    )
    db.commit()
    db.refresh(item)
    return item


@router.post("/wishlist/{item_id}/convert", response_model=PurchaseOut, status_code=201)
def convert_wishlist_item(
    item_id: uuid.UUID, body: WishlistConvert, admin: CurrentAdminWrite, db: DbSession
):
    """Turn a wishlist entry into a real purchase (spec A08).

    The wishlist row is kept, notes and all, marked "purchased" and linked to
    the new purchase.
    """
    item = get_or_404(db, WishlistItem, item_id, "Wishlist item")
    check_version(
        current_version=item.version,
        sent_version=body.version,
        force=False,
        changes={},
        current=WishlistOut.model_validate(item),
    )
    if item.status != WishlistStatus.WANTED:
        raise ApiError(422, "not_wanted", f"This item is already {item.status}.")
    purchase = create_purchase(db, body.purchase, admin.user.id)
    item.status = WishlistStatus.PURCHASED
    item.purchase_id = purchase.id
    audit.record(
        db,
        action="wishlist.convert",
        entity_type="wishlist_item",
        entity_id=item.id,
        actor_id=admin.user.id,
        summary={"purchase_id": str(purchase.id)},
    )
    db.commit()
    return purchase_out(purchase)
