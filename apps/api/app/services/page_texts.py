# ruff: noqa: E501  (the default About text keeps each paragraph on one line)
"""The editable texts on the website's fixed pages (Admin → Page texts).

Each text has a key, a label for the admin screen, and a default: the wording
the site shows until someone changes it. Only changed texts are stored (in
``page_texts``); "Reset to default" deletes the row.

Formatted texts may use a few simple marks (see the web app's
components/FormattedText.tsx, which turns them into HTML safely):

    ## A heading        - a bullet       1. a numbered step
    **bold words**      [link text](https://example.com) or [text](/about)

A blank line starts a new paragraph. Nothing is ever stored or shown as HTML.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PageText


@dataclass(frozen=True)
class PageTextDef:
    key: str
    page: str  # where it appears, for grouping on the admin screen
    label: str
    default: str
    hint: str = ""
    formatted: bool = False  # headings, lists, bold and links allowed
    max_length: int = 300


ABOUT_BODY = """## How we taste

Every gin is tasted at least twice before it is reviewed:

1. **Neat**, at room temperature, in a tulip glass: nose, palate and finish.
2. **With tonic**, over plenty of ice, with a light, neutral tonic first and then the garnish we think suits it best.

We score out of ten. A 7 is a good gin we would happily buy again; a 9 is one we recommend to everyone. Scores are personal, and the notes explain why.

## What you see here

The collection shows gins we have catalogued and chosen to share. Bottle counts, prices and our private tasting notes stay private."""

PAGE_TEXTS: tuple[PageTextDef, ...] = (
    PageTextDef(
        "home.eyebrow",
        "Home page",
        "Small line above the title",
        "A shared collection",
        max_length=80,
    ),
    PageTextDef(
        "home.intro",
        "Home page",
        "Introduction under the title",
        "Tasting notes, honest reviews and cocktails from a cabinet of gins collected by two "
        "friends.",
        max_length=400,
    ),
    PageTextDef(
        "home.empty_title",
        "Home page",
        "Heading shown while no gins are public yet",
        "The cabinet is being stocked",
        max_length=120,
    ),
    PageTextDef(
        "home.empty_text",
        "Home page",
        "Text shown while no gins are public yet",
        "The public collection, reviews and cocktail library open soon. Every bottle here is "
        "catalogued and tasted before it appears on the site.",
        max_length=600,
    ),
    PageTextDef(
        "about.intro",
        "About page",
        "Opening paragraph(s)",
        "One cabinet, two friends and a growing row of bottles. This site is where we keep "
        "track of what we drink, what we think of it and what we mix with it.",
        hint="Shown large, right under the photo. A blank line starts a new paragraph.",
        formatted=True,
        max_length=3000,
    ),
    PageTextDef(
        "about.body",
        "About page",
        "Main text",
        ABOUT_BODY,
        hint="Use ## for headings, - or 1. for lists, **bold**, and [text](address) for links.",
        formatted=True,
        max_length=10_000,
    ),
    PageTextDef(
        "about.contact_title", "About page", "Contact heading", "Get in touch", max_length=80
    ),
    PageTextDef(
        "about.contact_text",
        "About page",
        "Contact text",
        "Questions, tips or a gin we should try? Send us a message.",
        hint="A link to the contact form (or the contact email) follows automatically.",
        formatted=True,
        max_length=1000,
    ),
    PageTextDef(
        "contact.intro",
        "Contact page",
        "Text above the form",
        "Questions, tips or a gin we should try? Write to us here and we'll get back to you.",
        formatted=True,
        max_length=1000,
    ),
    PageTextDef("footer.text", "Every page", "Footer text", "© The Gin Cabinet", max_length=200),
)

BY_KEY = {d.key: d for d in PAGE_TEXTS}


def stored(db: Session) -> dict[str, PageText]:
    return {row.key: row for row in db.scalars(select(PageText))}


def resolved(db: Session) -> dict[str, str]:
    """Every text as the website should show it: the saved version, else the default."""
    rows = stored(db)
    return {d.key: (rows[d.key].value if d.key in rows else d.default) for d in PAGE_TEXTS}
