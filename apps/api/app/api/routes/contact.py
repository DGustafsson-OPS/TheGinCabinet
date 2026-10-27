"""The contact form: visitors send a message; admins read it in Admin → Messages.

The site sends no email, so messages wait in the admin inbox. Before a
message is saved:

1. **Cloudflare Turnstile** must confirm a person sent it (services/turnstile.py).
2. One IP address may send at most ``contact_per_hour`` messages an hour. Only a
   keyed hash of the address is stored for that, never the address itself.
3. A hidden "website" field catches simple bots: people never see it, so if it's
   filled in, we answer "sent" but throw the message away.

Messages are deleted automatically after ``contact_retention_days``
(services/maintenance.py). Only admins can read them: they hold visitors'
names and email addresses.
"""

import hashlib
import hmac
import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession, client_ip
from app.config import get_settings
from app.errors import ApiError
from app.models import ContactMessage
from app.models._types import utcnow
from app.schemas.common import Page, PageParams
from app.schemas.site_content import ContactIn, ContactMessageOut, ContactRead
from app.services import audit, turnstile
from app.services.common import get_or_404

public_router = APIRouter(prefix="/public/contact", tags=["public: contact"])
router = APIRouter(prefix="/admin/messages", tags=["admin: messages"])


def contact_form_enabled() -> bool:
    return bool(get_settings().turnstile_secret_key)


def _sender_hash(ip: str | None) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, (ip or "unknown").encode(), hashlib.sha256).hexdigest()


@public_router.post("", status_code=202)
def send_message(body: ContactIn, request: Request, db: DbSession) -> dict:
    if not contact_form_enabled():
        raise ApiError(404, "not_found", "The contact form is not available.")
    if body.website:  # the hidden bot trap was filled in
        return {"status": "sent"}
    ip = client_ip(request)
    sender = _sender_hash(ip)
    hour_ago = utcnow() - timedelta(hours=1)
    recent = db.scalar(
        select(func.count())
        .select_from(ContactMessage)
        .where(ContactMessage.sender_hash == sender, ContactMessage.created_at >= hour_ago)
    )
    if (recent or 0) >= get_settings().contact_per_hour:
        raise ApiError(429, "too_many_messages", "You've sent several messages. Please try later.")
    if not turnstile.verify(body.turnstile_token, ip):
        raise ApiError(
            422, "turnstile_failed", "We couldn't confirm you're not a robot. Please try again."
        )
    db.add(
        ContactMessage(
            name=body.name.strip(),
            email=body.email.strip(),
            message=body.message.strip(),
            sender_hash=sender,
        )
    )
    db.commit()
    return {"status": "sent"}


# ---------------- Admin inbox ----------------


def _out(m: ContactMessage) -> ContactMessageOut:
    return ContactMessageOut(
        id=m.id,
        name=m.name,
        email=m.email,
        message=m.message,
        created_at=m.created_at,
        read_at=m.read_at,
    )


@router.get("", response_model=Page[ContactMessageOut])
def list_messages(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    unread: bool = False,
):
    query = select(ContactMessage)
    if unread:
        query = query.where(ContactMessage.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(ContactMessage.created_at.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return Page[ContactMessageOut](items=[_out(m) for m in rows], meta=paging.meta(total))


@router.get("/unread-count")
def unread_count(admin: CurrentAdmin, db: DbSession) -> dict:
    count = db.scalar(
        select(func.count()).select_from(ContactMessage).where(ContactMessage.read_at.is_(None))
    )
    return {"unread": count or 0}


@router.patch("/{message_id}", response_model=ContactMessageOut)
def mark_message(message_id: uuid.UUID, body: ContactRead, admin: CurrentAdminWrite, db: DbSession):
    message = get_or_404(db, ContactMessage, message_id, "Message")
    message.read_at = (message.read_at or utcnow()) if body.read else None
    db.commit()
    return _out(message)


@router.delete("/{message_id}", status_code=204)
def delete_message(message_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    """Delete for good (the UI asks for confirmation first)."""
    message = get_or_404(db, ContactMessage, message_id, "Message")
    audit.record(
        db,
        action="message.delete",
        entity_type="contact_message",
        entity_id=message.id,
        actor_id=admin.user.id,
    )
    db.delete(message)
    db.commit()
