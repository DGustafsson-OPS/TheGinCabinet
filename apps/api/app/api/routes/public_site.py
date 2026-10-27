"""Public website settings (spec A10): name, tagline, logo, contact, about text."""

from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.settings import PublicSite
from app.services.editorial import media_summary
from app.services.site import get_site_settings

router = APIRouter(prefix="/public", tags=["public: site"])


@router.get("/site", response_model=PublicSite)
def get_public_site(db: DbSession):
    row = get_site_settings(db)
    db.commit()
    return PublicSite(
        site_name=row.site_name,
        tagline=row.tagline,
        meta_description=row.meta_description,
        contact_email=row.contact_email,
        logo=media_summary(row.logo),
        about_text=row.about_text,
    )
