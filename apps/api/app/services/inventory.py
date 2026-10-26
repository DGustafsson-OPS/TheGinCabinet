"""Rules for bottles and purchases (spec §5 A03, A04, §6 "Add gin and bottle", "Consume bottle")."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import (
    ALLOWED_TRANSITIONS,
    Bottle,
    BottleEvent,
    BottleStatus,
    GinProduct,
    Purchase,
    PurchaseLine,
)
from app.schemas.inventory import PurchaseIn, PurchaseLineOut, PurchaseOut
from app.services.common import collection_id, get_or_404


def add_bottle(
    db: Session,
    *,
    gin_id: uuid.UUID,
    size_ml: int,
    actor_id: uuid.UUID,
    status: str = BottleStatus.SEALED,
    remaining_ml: int | None = None,
    shelf: str | None = None,
    source: str | None = None,
    acquired_on: date | None = None,
    comments: str | None = None,
    purchase_line: PurchaseLine | None = None,
) -> Bottle:
    """Create one physical bottle and the first entry of its history."""
    if status == BottleStatus.OPEN and remaining_ml is None:
        remaining_ml = size_ml
    bottle = Bottle(
        collection_id=collection_id(db),
        gin_id=gin_id,
        size_ml=size_ml,
        status=status,
        remaining_ml=remaining_ml if status == BottleStatus.OPEN else None,
        shelf=shelf,
        source=source,
        acquired_on=acquired_on,
        comments=comments,
        purchase_line_id=purchase_line.id if purchase_line else None,
    )
    db.add(bottle)
    db.flush()  # gives the bottle its id so the event can point to it
    db.add(
        BottleEvent(
            bottle_id=bottle.id,
            actor_id=actor_id,
            from_status=None,
            to_status=status,
            remaining_ml=bottle.remaining_ml,
            note="Added to the cabinet",
        )
    )
    return bottle


def change_status(
    db: Session,
    bottle: Bottle,
    *,
    new_status: BottleStatus,
    actor_id: uuid.UUID,
    remaining_ml: int | None = None,
    on: date | None = None,
    note: str | None = None,
) -> None:
    """Move a bottle along its life: sealed → open → empty (or gifted/disposed)."""
    old_status = BottleStatus(bottle.status)
    allowed = ALLOWED_TRANSITIONS[old_status]
    if new_status not in allowed:
        raise ApiError(
            422,
            "invalid_transition",
            f"A bottle that is {old_status} cannot become {new_status}.",
            details={"allowed": sorted(allowed)},
        )
    on = on or date.today()

    if new_status == BottleStatus.OPEN:
        bottle.opened_at = on
        bottle.remaining_ml = bottle.size_ml if remaining_ml is None else remaining_ml
    elif new_status == BottleStatus.EMPTY:
        bottle.finished_at = on
        bottle.remaining_ml = 0
    else:  # gifted or disposed: it left the cabinet on this day
        bottle.finished_at = on
    check_remaining(bottle, bottle.remaining_ml)
    bottle.status = new_status

    db.add(
        BottleEvent(
            bottle_id=bottle.id,
            actor_id=actor_id,
            from_status=old_status,
            to_status=new_status,
            remaining_ml=bottle.remaining_ml,
            note=note,
        )
    )


def update_level(db: Session, bottle: Bottle, remaining_ml: int, actor_id: uuid.UUID) -> None:
    """Record "about N ml left" for an open bottle (spec §6 "set approximate remaining volume")."""
    if bottle.status != BottleStatus.OPEN:
        raise ApiError(422, "not_open", "Only an open bottle has a level to update.")
    check_remaining(bottle, remaining_ml)
    bottle.remaining_ml = remaining_ml
    db.add(
        BottleEvent(
            bottle_id=bottle.id,
            actor_id=actor_id,
            from_status=BottleStatus.OPEN,
            to_status=BottleStatus.OPEN,
            remaining_ml=remaining_ml,
            note="Level updated",
        )
    )


def check_remaining(bottle: Bottle, remaining_ml: int | None) -> None:
    if remaining_ml is not None and not 0 <= remaining_ml <= bottle.size_ml:
        raise ApiError(
            422, "remaining_out_of_range", f"Remaining must be between 0 and {bottle.size_ml} ml."
        )


def create_purchase(db: Session, data: PurchaseIn, actor_id: uuid.UUID) -> Purchase:
    """Save a purchase and create one bottle per purchased unit (spec A04)."""
    for line in data.lines:
        get_or_404(db, GinProduct, line.gin_id, "Gin")

    purchase = Purchase(
        purchased_on=data.purchased_on,
        retailer=data.retailer.strip(),
        currency=data.currency,
        reference=data.reference,
        notes=data.notes,
        created_by_id=actor_id,
    )
    # `enumerate` gives (0, first), (1, second), ... so we can store the order.
    for position, line_in in enumerate(data.lines):
        purchase.lines.append(
            PurchaseLine(
                gin_id=line_in.gin_id,
                position=position,
                size_ml=line_in.size_ml,
                quantity=line_in.quantity,
                unit_price=line_in.unit_price,
            )
        )
    db.add(purchase)
    db.flush()

    for line in purchase.lines:
        for _ in range(line.quantity):  # `_` = "I don't need the loop number"
            add_bottle(
                db,
                gin_id=line.gin_id,
                size_ml=line.size_ml,
                actor_id=actor_id,
                shelf=data.shelf,
                source="gift" if line.unit_price is None else "purchase",
                acquired_on=data.purchased_on,
                purchase_line=line,
            )
    return purchase


def purchase_out(purchase: Purchase) -> PurchaseOut:
    lines = []
    total = Decimal("0.00")
    without_price = 0
    for line in purchase.lines:
        line_total = None
        if line.unit_price is not None:
            line_total = line.unit_price * line.quantity
            total += line_total
        else:
            without_price += line.quantity
        lines.append(
            PurchaseLineOut.model_validate(line).model_copy(update={"line_total": line_total})
        )
    return PurchaseOut(
        id=purchase.id,
        purchased_on=purchase.purchased_on,
        retailer=purchase.retailer,
        currency=purchase.currency,
        reference=purchase.reference,
        notes=purchase.notes,
        lines=lines,
        total=total,
        bottles_without_price=without_price,
        created_by_id=purchase.created_by_id,
        version=purchase.version,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
    )
