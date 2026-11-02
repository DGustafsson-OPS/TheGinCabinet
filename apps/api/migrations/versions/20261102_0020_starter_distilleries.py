"""Thirteen distilleries behind gins in the cabinet (added for the website).

Each is named after the distillery that makes the gin, with the gin named in
the description so visitors can find it either way. A distillery shows on the
public site once a public gin is linked to it (spec §4 P08), so these wait
quietly until their gins are added.

Any distillery that already exists with the same name or URL name is left
alone. Downgrading removes only the ones added here that no gin uses.

The two distilleries already on the site, Kyrö and Bombay, get their full
names; their country, region, website and description are filled in only
where empty, and their URL names stay, so links keep working. (Downgrading
leaves these corrections in place.)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-02 12:30:00.000000

"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DISTILLERIES = [
    {
        "slug": "aviation-american-gin-distillery",
        "name": "Aviation American Gin Distillery",
        "country": "United States",
        "region": "Portland, Oregon",
        "website": "https://www.aviationgin.com",
        "description": "Makes Aviation American Gin. The gin began at House Spirits on Portland's "
        "Distillery Row; its own distillery and tasting room in Northwest Portland opened in 2022.",
    },
    {
        "slug": "arctic-blue-beverages",
        "name": "Arctic Blue Beverages",
        "country": "Finland",
        "region": "Ilomantsi and Helsinki",
        "website": None,
        "description": "The Finnish company behind Arctic Blue Gin, made with botanicals from the "
        "Finnish Arctic. Distilled in Ilomantsi, eastern Finland, with a micro-distillery and "
        "showroom in Helsinki.",
    },
    {
        "slug": "beefeater-distillery",
        "name": "Beefeater Distillery",
        "country": "England",
        "region": "Kennington, London",
        "website": "https://www.beefeatergin.com",
        "description": "Home of Beefeater London Dry Gin, distilled in London.",
    },
    {
        "slug": "hendricks-gin-distillery",
        "name": "Hendrick's Gin Distillery",
        "country": "Scotland",
        "region": "Girvan, Ayrshire",
        "website": "https://www.hendricksgin.com",
        "description": "Makes Hendrick's Gin, known for its cucumber and rose. Part of William "
        "Grant & Sons.",
    },
    {
        "slug": "altia-eesti",
        "name": "Altia Eesti",
        "country": "Estonia",
        "region": None,
        "website": None,
        "description": "The Estonian producer of Saaremaa Gin, named after Estonia's largest "
        "island.",
    },
    {
        "slug": "cameronbridge-distillery",
        "name": "Cameronbridge Distillery",
        "country": "Scotland",
        "region": "Fife",
        "website": "https://www.tanqueray.com",
        "description": "Where Tanqueray gin is distilled today. Part of Diageo.",
    },
    {
        "slug": "gjellerasen-distillery",
        "name": "Gjelleråsen Distillery",
        "country": "Norway",
        "region": "Nittedal, Akershus",
        "website": None,
        "description": "Makes Skagerrak Nordic Dry Gin. Run by Anora (formerly Arcus).",
    },
    {
        "slug": "liviko",
        "name": "Liviko",
        "country": "Estonia",
        "region": "Tallinn",
        "website": "https://liviko.eu",
        "description": "Makes the Crafter's gins (London Dry, Aromatic Flower, Wild Forest and "
        "more) at its distillery in the centre of Tallinn.",
    },
    {
        "slug": "black-forest-distillers",
        "name": "Black Forest Distillers",
        "country": "Germany",
        "region": "Black Forest",
        "website": "https://www.monkey47.com",
        "description": "Makes Monkey 47 Schwarzwald Dry Gin, with 47 botanicals.",
    },
    {
        "slug": "agras-distillery",
        "name": "Ägräs Distillery",
        "country": "Finland",
        "region": "Fiskars",
        "website": None,
        "description": "A small distillery in an old knife factory in Fiskars, founded in 2016, "
        "making Ägräs Gin from wild herbs gathered nearby.",
    },
    {
        "slug": "junimperium-distillery",
        "name": "Junimperium Distillery",
        "country": "Estonia",
        "region": "Tallinn",
        "website": "https://junimperium.ee",
        "description": "A craft gin distillery in Tallinn's Telliskivi Quarter, opened in 2019; "
        "IWSC International Gin Producer of 2022.",
    },
    {
        "slug": "torino-distillati",
        "name": "Torino Distillati",
        "country": "Italy",
        "region": "Moncalieri, Turin",
        "website": "https://www.malfygin.com",
        "description": "Makes Malfy Gin, known for its Italian lemons and blood oranges.",
    },
    {
        "slug": "hope-distillery",
        "name": "Hope Distillery",
        "country": "Estonia",
        "region": "Tallinn",
        "website": "https://gindome.eu",
        "description": "A craft distillery in Tallinn, established in 2020, making the Gindome "
        "gins (Mermaid Navy, Old Tom and more).",
    },
]

# Existing distilleries to correct, found by the start of their name
# (case-insensitive).
CORRECTIONS = [
    {
        "match": ["kyrö", "kyro"],
        "name": "Kyrö Distillery Company",
        "country": "Finland",
        "region": "Isokyrö",
        "website": "https://kyrodistillery.com",
        "description": "Makes Kyrö Gin (called Napue until 2019) and rye whisky in Isokyrö, "
        "western Finland. Kyrö's gin and tonic was named best gin for a G&T at the IWSC 2015.",
    },
    {
        "match": ["bombay"],
        "name": "Bombay Sapphire Distillery",
        "country": "England",
        "region": "Laverstoke Mill, Whitchurch, Hampshire",
        "website": "https://www.bombaysapphire.com",
        "description": "Makes Bombay Sapphire at Laverstoke Mill, a former banknote paper mill "
        "turned distillery in 2014, with glasshouses by Thomas Heatherwick.",
    },
]

distilleries = sa.table(
    "distilleries",
    sa.column("id", sa.Uuid()),
    sa.column("slug", sa.String()),
    sa.column("name", sa.String()),
    sa.column("country", sa.String()),
    sa.column("region", sa.String()),
    sa.column("description", sa.Text()),
    sa.column("website", sa.String()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
    sa.column("version", sa.Integer()),
)


def upgrade() -> None:
    """Add the distilleries that aren't there yet."""
    conn = op.get_bind()
    existing = conn.execute(sa.select(distilleries.c.slug, distilleries.c.name)).all()
    taken_slugs = {slug for slug, _ in existing}
    taken_names = {name.lower() for _, name in existing}
    now = datetime.now(UTC)
    rows = [
        {"id": uuid.uuid4(), **d, "created_at": now, "updated_at": now, "version": 1}
        for d in DISTILLERIES
        if d["slug"] not in taken_slugs and d["name"].lower() not in taken_names
    ]
    if rows:
        op.bulk_insert(distilleries, rows)

    # Correct Kyrö and Bombay: the full name always, the other details only if empty.
    current = conn.execute(
        sa.select(
            distilleries.c.id,
            distilleries.c.name,
            distilleries.c.country,
            distilleries.c.region,
            distilleries.c.website,
            distilleries.c.description,
        )
    ).all()
    for fix in CORRECTIONS:
        for row in current:
            if not any(row.name.lower().startswith(m) for m in fix["match"]):
                continue
            values = {"name": fix["name"], "updated_at": now}
            for field in ("country", "region", "website", "description"):
                if not getattr(row, field):
                    values[field] = fix[field]
            conn.execute(distilleries.update().where(distilleries.c.id == row.id).values(**values))


def downgrade() -> None:
    """Remove the distilleries added here, unless a gin uses them."""
    gins = sa.table("gin_products", sa.column("distillery_id", sa.Uuid()))
    used = sa.select(gins.c.distillery_id).where(gins.c.distillery_id.is_not(None))
    op.execute(
        distilleries.delete().where(
            distilleries.c.slug.in_([d["slug"] for d in DISTILLERIES]),
            distilleries.c.id.not_in(used),
        )
    )
