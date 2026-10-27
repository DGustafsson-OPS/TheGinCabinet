"""The website settings row (spec A10)."""

from sqlalchemy.orm import Session

from app.models import SETTINGS_ID, SiteSettings


def get_site_settings(db: Session) -> SiteSettings:
    """Return the one settings row, creating it with defaults the first time."""
    row = db.get(SiteSettings, SETTINGS_ID)
    if row is None:
        row = SiteSettings(id=SETTINGS_ID)
        db.add(row)
        db.flush()
    return row
