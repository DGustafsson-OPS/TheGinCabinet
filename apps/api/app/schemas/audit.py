"""Response shape for audit events."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    # from_attributes lets Pydantic read values straight from a database object.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None = None
    entity_type: str
    entity_id: str | None
    action: str
    occurred_at: datetime
    summary: dict[str, Any]
    ip_address: str | None = None  # admin-only: helps spot unknown sign-in attempts
