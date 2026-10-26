"""Admin dashboard numbers (spec §5 A01)."""

from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.models import (
    IN_CABINET,
    AuditEvent,
    Bottle,
    BottleStatus,
    GinProduct,
    Purchase,
    PurchaseLine,
    User,
    WishlistItem,
    WishlistStatus,
)
from app.schemas.audit import AuditEventOut
from app.schemas.inventory import DashboardOut, InventoryValue

router = APIRouter(prefix="/admin", tags=["admin: dashboard"])


def _count(db: DbSession, query) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(admin: CurrentAdmin, db: DbSession):
    in_cabinet = select(Bottle).where(Bottle.status.in_(IN_CABINET))

    # Spec A01: value = sum of purchase cost of bottles still in the cabinet,
    # grouped per currency. Bottles without a known price are excluded from the
    # sum and counted separately, so the number is never silently too low.
    value_rows = db.execute(
        select(Purchase.currency, func.sum(PurchaseLine.unit_price), func.count(Bottle.id))
        .select_from(Bottle)
        .join(PurchaseLine, Bottle.purchase_line_id == PurchaseLine.id)
        .join(Purchase, PurchaseLine.purchase_id == Purchase.id)
        .where(Bottle.status.in_(IN_CABINET), PurchaseLine.unit_price.is_not(None))
        .group_by(Purchase.currency)
        .order_by(Purchase.currency)
    ).all()
    priced_bottles = sum(count for _, _, count in value_rows)
    physical = _count(db, in_cabinet)

    recent = db.execute(
        select(AuditEvent, User.display_name)
        .outerjoin(User, AuditEvent.actor_id == User.id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(10)
    ).all()

    return DashboardOut(
        unique_gins=_count(db, select(GinProduct)),
        physical_bottles=physical,
        open_bottles=_count(db, select(Bottle).where(Bottle.status == BottleStatus.OPEN)),
        inventory_value=[
            InventoryValue(currency=currency, amount=Decimal(amount), bottles=count)
            for currency, amount, count in value_rows
        ],
        bottles_without_cost=physical - priced_bottles,
        public_gins=_count(db, select(GinProduct).where(GinProduct.public_visible.is_(True))),
        wishlist_wanted=_count(
            db, select(WishlistItem).where(WishlistItem.status == WishlistStatus.WANTED)
        ),
        recent_activity=[
            AuditEventOut.model_validate(event).model_copy(update={"actor_name": name})
            for event, name in recent
        ],
    )
