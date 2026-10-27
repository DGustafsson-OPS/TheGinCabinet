"""The Gin guide: lasting reference pages (gin styles, history, glassware…).

Unlike Journal articles these aren't news: they have no date, category or
author, and appear in an order the editors choose (``position``). The body
uses the same JSON blocks as the Journal (see ``app.models.blog``), so the
same editor, safety checks and public rendering work for both.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid
from app.models.editorial import MediaAsset
from app.models.user import User


class GuidePage(Versioned, Base):
    __tablename__ = "guide_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    # One or two sentences: shown on the guide's front page and under the title.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_blocks: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    hero_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hero_credit: Mapped[str | None] = mapped_column(String(200), nullable=True)
    seo_title: Mapped[str | None] = mapped_column(String(70), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(170), nullable=True)
    # Lower numbers come first on the guide's front page.
    position: Mapped[int] = mapped_column(Integer, default=0, index=True)
    published: Mapped[bool] = mapped_column(default=False)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    edited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    hero: Mapped[MediaAsset | None] = relationship(lazy="joined")
    edited_by: Mapped[User | None] = relationship(lazy="joined")
