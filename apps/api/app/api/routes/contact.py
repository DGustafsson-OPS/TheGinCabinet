"""The contact form: visitors send a message; admins read it in Admin → Messages.

The site sends no email, so messages wait in the admin inbox. Before a
message is saved:

1. **Cloudflare Turnstile** must confirm a person sent it (services/turnstile.py).
2. One IP address may send at most ``contact_per_hour`` messages an hour. Only a
   keyed hash of the address is stored for that, never the address itself.
3. A hidden "website" field catches simple bots: people never see it, so if it's
   filled in, we answer "sent" but throw the message away.

Messages are deleted automatically after ``contact_retention_days``, and
messages marked as spam 90 days after that (services/maintenance.py). Only
admins can read them: they hold visitors' names and email addresses.

In the admin inbox, messages can be moved into folders (Ideas, Dennis, …),
marked as spam, and given notes such as a copy of the reply that was sent.
"""

import hashlib
import hmac
import uuid
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession, client_ip
from app.config import get_settings
from app.errors import ApiError
from app.models import ContactMessage, ContactMessageNote, MessageFolder
from app.models._types import utcnow
from app.schemas.common import Page, PageParams
from app.schemas.site_content import (
    ContactIn,
    ContactMessageOut,
    MessageBoxes,
    MessageFolderIn,
    MessageFolderOut,
    MessageFolderRef,
    MessageNoteIn,
    MessageNoteOut,
    MessagePatch,
)
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

View = Literal["inbox", "folder", "spam", "all"]


def _out(m: ContactMessage) -> ContactMessageOut:
    return ContactMessageOut(
        id=m.id,
        name=m.name,
        email=m.email,
        message=m.message,
        created_at=m.created_at,
        read_at=m.read_at,
        folder=MessageFolderRef(id=m.folder.id, name=m.folder.name) if m.folder else None,
        spam_at=m.spam_at,
        notes=[
            MessageNoteOut(
                id=n.id,
                text=n.text,
                author_name=n.author.display_name if n.author else None,
                created_at=n.created_at,
            )
            for n in m.notes
        ],
    )


def _not_spam():
    return ContactMessage.spam_at.is_(None)


@router.get("", response_model=Page[ContactMessageOut])
def list_messages(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    unread: bool = False,
    view: Annotated[View, Query(description="inbox, one folder, spam, or all but spam")] = "all",
    folder_id: uuid.UUID | None = None,
):
    query = select(ContactMessage)
    if view == "spam":
        query = query.where(ContactMessage.spam_at.is_not(None))
    else:
        query = query.where(_not_spam())
        if view == "inbox":
            query = query.where(ContactMessage.folder_id.is_(None))
        elif view == "folder":
            if folder_id is None:
                raise ApiError(422, "validation_error", "Choose a folder.")
            query = query.where(ContactMessage.folder_id == folder_id)
    if unread:
        query = query.where(ContactMessage.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(ContactMessage.created_at.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).unique()
    return Page[ContactMessageOut](items=[_out(m) for m in rows], meta=paging.meta(total))


@router.get("/unread-count")
def unread_count(admin: CurrentAdmin, db: DbSession) -> dict:
    """New messages anywhere except Spam (shown in the admin menu and dashboard)."""
    count = db.scalar(
        select(func.count())
        .select_from(ContactMessage)
        .where(ContactMessage.read_at.is_(None), _not_spam())
    )
    return {"unread": count or 0}


@router.get("/boxes", response_model=MessageBoxes)
def message_boxes(admin: CurrentAdmin, db: DbSession):
    """Counts for the Inbox, every folder (even empty ones) and Spam."""
    rows = db.execute(
        select(
            ContactMessage.folder_id,
            func.count(),
            func.count(ContactMessage.id).filter(ContactMessage.read_at.is_(None)),
        )
        .where(_not_spam())
        .group_by(ContactMessage.folder_id)
    ).all()
    counts = {folder_id: (total, unread) for folder_id, total, unread in rows}
    none = (0, 0)
    spam = db.scalar(select(func.count()).select_from(ContactMessage).where(~_not_spam()))
    folders = db.scalars(select(MessageFolder).order_by(func.lower(MessageFolder.name))).all()
    return MessageBoxes(
        inbox_count=counts.get(None, none)[0],
        inbox_unread=counts.get(None, none)[1],
        folders=[
            MessageFolderOut(
                id=f.id,
                name=f.name,
                count=counts.get(f.id, none)[0],
                unread=counts.get(f.id, none)[1],
            )
            for f in folders
        ],
        spam_count=spam or 0,
    )


# ---- Folders


def _folder_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not name:
        raise ApiError(422, "validation_error", "Give the folder a name.")
    if name.lower() in {"inbox", "spam"}:
        raise ApiError(422, "reserved_name", f'"{name}" is already a built-in folder.')
    return name


def _save_folder(db, folder: MessageFolder) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(409, "folder_exists", "There's already a folder with that name.") from exc


@router.post("/folders", response_model=MessageFolderRef, status_code=201)
def create_folder(body: MessageFolderIn, admin: CurrentAdminWrite, db: DbSession):
    folder = MessageFolder(name=_folder_name(body.name))
    db.add(folder)
    _save_folder(db, folder)
    return MessageFolderRef(id=folder.id, name=folder.name)


@router.patch("/folders/{folder_id}", response_model=MessageFolderRef)
def rename_folder(
    folder_id: uuid.UUID, body: MessageFolderIn, admin: CurrentAdminWrite, db: DbSession
):
    folder = get_or_404(db, MessageFolder, folder_id, "Folder")
    folder.name = _folder_name(body.name)
    _save_folder(db, folder)
    return MessageFolderRef(id=folder.id, name=folder.name)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    """Delete a folder; its messages go back to the Inbox (nothing is lost)."""
    folder = get_or_404(db, MessageFolder, folder_id, "Folder")
    for message in db.scalars(select(ContactMessage).where(ContactMessage.folder_id == folder.id)):
        message.folder_id = None
    db.delete(folder)
    db.commit()


# ---- One message


@router.patch("/{message_id}", response_model=ContactMessageOut)
def update_message(
    message_id: uuid.UUID, body: MessagePatch, admin: CurrentAdminWrite, db: DbSession
):
    """Mark read/unread, move to a folder (``null`` = Inbox), or mark (not) spam."""
    message = get_or_404(db, ContactMessage, message_id, "Message")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("read") is not None:
        message.read_at = (message.read_at or utcnow()) if changes["read"] else None
    if "folder_id" in changes:
        if changes["folder_id"] is not None:
            get_or_404(db, MessageFolder, changes["folder_id"], "Folder")
        message.folder_id = changes["folder_id"]
    if changes.get("spam") is True and message.spam_at is None:
        message.spam_at = utcnow()
        message.read_at = message.read_at or utcnow()  # spam never counts as new
    elif changes.get("spam") is False:
        message.spam_at = None
    db.commit()
    db.refresh(message)
    return _out(message)


@router.post("/{message_id}/notes", response_model=ContactMessageOut, status_code=201)
def add_note(message_id: uuid.UUID, body: MessageNoteIn, admin: CurrentAdminWrite, db: DbSession):
    message = get_or_404(db, ContactMessage, message_id, "Message")
    text = body.text.strip()
    if not text:
        raise ApiError(422, "validation_error", "Write something in the note.")
    message.notes.append(ContactMessageNote(text=text, author_id=admin.user.id))
    db.commit()
    db.refresh(message)
    return _out(message)


@router.delete("/{message_id}/notes/{note_id}", response_model=ContactMessageOut)
def delete_note(message_id: uuid.UUID, note_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    message = get_or_404(db, ContactMessage, message_id, "Message")
    note = next((n for n in message.notes if n.id == note_id), None)
    if note is None:
        raise ApiError(404, "not_found", "Note not found.")
    message.notes.remove(note)
    db.commit()
    db.refresh(message)
    return _out(message)


@router.delete("/{message_id}", status_code=204)
def delete_message(message_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    """Delete for good, with its notes (the UI asks for confirmation first)."""
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
