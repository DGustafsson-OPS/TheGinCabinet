"""Website settings editable by the admins (spec §5 A10).

There is exactly one row (id = 1). ``Versioned`` protects it like any other
record: if both admins edit the settings at once, the second save gets a
conflict instead of silently overwriting the first.
"""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models.editorial import MediaAsset

SETTINGS_ID = 1


class SiteSettings(Versioned, Base):
    __tablename__ = "site_settings"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=SETTINGS_ID)
    site_name: Mapped[str] = mapped_column(String(80), default="The Gin Cabinet")
    tagline: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The default description search engines show for the site.
    meta_description: Mapped[str | None] = mapped_column(String(170), nullable=True)
    # A public contact address (shown on the About page). Never an admin's login email.
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    logo_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True
    )
    # Whether newly added gins start as public (spec A10 "default gin visibility").
    default_gin_public: Mapped[bool] = mapped_column(default=False)
    about_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    logo: Mapped[MediaAsset | None] = relationship(lazy="joined")
