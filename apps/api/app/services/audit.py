"""Write audit events (spec §9: "Audit log on publication, sign-in, inventory
changes and deletions")."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditEvent


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    summary: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditEvent:
    """Add an audit event to the current database transaction.

    The ``*`` in the signature forces callers to name every argument
    (``record(db, action="auth.login", ...)``), which keeps call sites readable.

    The event is saved when the caller commits, together with the change it
    describes: either both are saved or neither is.
    """
    event = AuditEvent(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        actor_id=actor_id,
        summary=summary or {},
        ip_address=ip_address,
    )
    db.add(event)
    return event
