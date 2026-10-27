"""Gin guide helpers: turning pages into JSON for admins and for visitors."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GuidePage
from app.schemas.editorial import Person
from app.schemas.guide import GuidePageOut, PublicGuideCard, PublicGuidePage
from app.services.blog import card_refs, public_blocks, public_cards
from app.services.editorial import media_summary


def ordered():
    """All pages in their chosen order (title breaks ties)."""
    return select(GuidePage).order_by(GuidePage.position, GuidePage.title)


def visible():
    return ordered().where(GuidePage.published.is_(True))


def page_out(page: GuidePage) -> GuidePageOut:
    return GuidePageOut(
        id=page.id,
        slug=page.slug,
        title=page.title,
        summary=page.summary,
        body_blocks=page.body_blocks or [],
        hero_media_id=page.hero_media_id,
        hero_image=media_summary(page.hero),
        hero_credit=page.hero_credit,
        seo_title=page.seo_title,
        seo_description=page.seo_description,
        position=page.position,
        published=page.published,
        published_at=page.published_at,
        edited_by=Person.model_validate(page.edited_by) if page.edited_by else None,
        version=page.version,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


def public_card(page: GuidePage) -> PublicGuideCard:
    return PublicGuideCard(
        slug=page.slug, title=page.title, summary=page.summary, image=media_summary(page.hero)
    )


def public_page(db: Session, page: GuidePage, neighbours: list[GuidePage]) -> PublicGuidePage:
    """The page as visitors see it. ``neighbours`` is the ordered list it belongs to."""
    blocks = page.body_blocks or []
    index = next((i for i, p in enumerate(neighbours) if p.id == page.id), None)
    previous = neighbours[index - 1] if index else None
    following = neighbours[index + 1] if index is not None and index + 1 < len(neighbours) else None
    return PublicGuidePage(
        **public_card(page).model_dump(),
        body=public_blocks(db, blocks, public_cards(db, card_refs(blocks))),
        hero_credit=page.hero_credit,
        seo_title=page.seo_title,
        seo_description=page.seo_description,
        updated_at=page.updated_at,
        previous=public_card(previous) if previous else None,
        next=public_card(following) if following else None,
    )
