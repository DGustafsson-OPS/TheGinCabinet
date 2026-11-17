"""Twenty-five distilleries behind the gins found in the November 2026 photo survey.

The gins themselves come in through the CSV import (``import/gins_for_import.csv``
in the repository). The importer can only give a new distillery a name and a
country, so this migration adds the full profiles: region, website and a
description, in the same style as migration 0020.

It works whichever comes first, this migration or the gin import:

* A distillery that isn't on the site yet is added.
* One that already exists (same URL name, same name, or the name an earlier
  version of the import file used, e.g. "edelranz GmbH") gets the clean name,
  and its country, region, website and description are filled in only where
  empty, so anything typed in the admin area is kept.

Facts were researched on 2026-11-17 from producers' pages, trade press and
retailers. Where sources disagreed, the text leaves the point out.
Downgrading removes only the distilleries added here that no gin uses.

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-17 16:00:00.000000

"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024"
down_revision: str | Sequence[str] | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# "old_names": what the first version of the gin import file called the
# distillery, in case that file was imported before this migration ran.
DISTILLERIES = [
    {
        "slug": "williams-humbert",
        "name": "Williams & Humbert",
        "old_names": [],
        "country": "Spain",
        "region": "Jerez de la Frontera, Andalusia",
        "website": "https://www.williams-humbert.com",
        "description": (
            "A sherry and brandy bodega in Jerez de la Frontera, founded in 1877 by the "
            "Britons Alexander Williams and Arthur Humbert, and owned by the Medina family "
            "since the 1990s. Its Cubical range of London Dry gins includes Cubical Ultra "
            "Premium, bottled at 45%, alongside a 40% Premium and flavoured versions. The "
            "gins are not made in Jerez: they are distilled under contract at Langley "
            "Distillery in the West Midlands of England, where gin has been made since 1920. "
            "The botanicals include juniper, coriander, angelica, citrus peels, liquorice, "
            "cassia, almond shell and Buddha's hand."
        ),
    },
    {
        "slug": "distillirium",
        "name": "Distillirium",
        "old_names": [],
        "country": "Estonia",
        "region": "Tallinn, Harju County",
        "website": "https://www.metsisgin.com",
        "description": (
            "A Tallinn craft distillery, registered in 2017 as one of Estonia's first craft "
            "gin producers. Its gins are sold under the Metsis name, the Estonian word for "
            "the wood grouse. The base spirit is made from organic rye grown and distilled in "
            "Estonia, and the juniper comes from the Estonian islands; the gin is distilled "
            "in small batches in a pot still. Metsis Color Changing Blue Gin is coloured with "
            "butterfly pea flower, so it changes colour when tonic or citrus is added."
        ),
    },
    {
        "slug": "wolf-oak-distillery",
        "name": "Wolf & Oak Distillery",
        "old_names": [],
        "country": "Poland",
        "region": "Stanica",
        "website": "https://wolfoak.pl",
        "description": (
            "A Polish craft distillery founded by Michał Płucisz. It grew out of Wolf "
            "Distillery, a hobby project making spirits from 2011, and has traded as Wolf & "
            "Oak since 2018. Production takes place in a restored 19th-century distillery "
            "building in the village of Stanica, which the company bought and renovated, "
            "partly paid for by a 2020 crowdfunding share issue that drew around 1,500 "
            "shareholders. Alongside rye vodka, flavoured vodkas and liqueurs, it makes gin, "
            "including the Wolf & Oak Rzemieślniczy (craft) Gin London Dry."
        ),
    },
    {
        "slug": "aland-distillery",
        "name": "Åland Distillery",
        "old_names": [],
        "country": "Finland",
        "region": "Kastelholm, Sund, Åland",
        "website": "https://alanddistillery.com",
        "description": (
            "The first distillery on the Åland Islands, founded in 2019 by Michael and Jenny "
            "Björklund with a group of local partners. It stands next to Kastelholm Castle "
            "and the Vita Björn prison museum. The gins are made in small batches on copper "
            "pot stills built by Christian Carl, using botanicals grown on Åland alongside "
            "spices of the kind seafarers once brought home. Besides the Åland Distillery "
            "Gin, the range includes a Dry Gin, a Rosé gin, liqueurs and long drinks."
        ),
    },
    {
        "slug": "district-9-distilling-company",
        "name": "District 9 Distilling Company",
        "old_names": [],
        "country": "Vietnam",
        "region": "Ho Chi Minh City",
        "website": "https://saigonbaigur.com",
        "description": (
            "A craft distillery in Ho Chi Minh City, set up by the Dutch entrepreneurs Jochem "
            "Lisser and Florian Draaisma, who began developing the gin in 2018. Its gin, "
            "Saigon Baigur Premium Dry Gin, launched in 2020 as the first gin from Ho Chi "
            "Minh City. It is distilled in copper pot stills from 12 Vietnamese botanicals, "
            "among them fresh Buddha's hand and vapour-infused lotus flower, combined with "
            "four classic gin ingredients including imported juniper. In 2025 the company "
            "moved to a larger distillery, which runs a gin school where visitors can "
            "distil their own bottle."
        ),
    },
    {
        "slug": "teerenpeli-brewery-distillery",
        "name": "Teerenpeli Brewery & Distillery",
        "old_names": [],
        "country": "Finland",
        "region": "Lahti, Päijät-Häme",
        "website": "https://teerenpeli.com",
        "description": (
            "A family business in Lahti owned by Anssi and Marianne Pyysing, which began with "
            "a bar and a brewery in the 1990s. The distillery was founded in 2002 in the same "
            "building as the Taivaanranta restaurant in central Lahti, and a larger second "
            "distillery opened at the brewery in 2015. Teerenpeli is best known as one of "
            "Finland's first single malt whisky producers. Its first gin, Teerenpeli Pyy Gin, "
            "is distilled in copper pot stills and bottled at 45%; its botanicals include "
            "juniper, lingonberry, Amarillo hops, lemon peel, coriander and liquorice root."
        ),
    },
    {
        "slug": "black-friars-distillery",
        "name": "Black Friars Distillery",
        "old_names": ["Plymouth Gin Distillery (Black Friars)"],
        "country": "England",
        "region": "Barbican, Plymouth, Devon",
        "website": "https://www.plymouthgin.com",
        "description": (
            "The home of Plymouth Gin, on Southside Street in Plymouth's Barbican. Gin has "
            "been made here since 1793, when the Coates family joined an existing distilling "
            "business, and the company calls it England's oldest working gin distillery. "
            "Parts of the building date from the early 1400s, including the Refectory Room "
            "with its timber roof of 1431. The business traded as Coates & Co. until 2004 "
            "and has belonged to Pernod Ricard since 2008. Plymouth Gin Original Strength is "
            "made to a recipe the distillery says is unchanged since 1793."
        ),
    },
    {
        "slug": "j-rose",
        "name": "J.Rose",
        "old_names": ["Affreschi & Affreschi Srl (J.Rose)"],
        "country": "Italy",
        "region": "Minervino di Lecce, Apulia",
        "website": "",
        "description": (
            "A gin brand from the Salento peninsula, created by Dario Roselli, owner of "
            "Affreschi & Affreschi, a Minervino di Lecce company that designs decorative wall "
            "coverings. The brand grew out of the firm's collaboration with the comic artist "
            "Milo Manara, and most bottlings carry his artwork. The gin is not distilled in "
            "Apulia: J.Rose London Dry Gin is made under contract by Liquorificio Italia in "
            "Trieste from cereal spirit and nine botanicals, including juniper, bergamot, "
            "mandarin peel and prickly pear blossom."
        ),
    },
    {
        "slug": "kada",
        "name": "Kada",
        "old_names": [],
        "country": "Estonia",
        "region": "",
        "website": "",
        "description": (
            "An Estonian gin brand sold mainly in Estonian supermarkets. Its flavoured range, "
            "mostly at 37.5% in 50cl bottles, includes Kadaka (juniper), Kirsi (cherry), "
            "Tikri (blackcurrant), Pihlaka (rowan) and rhubarb. Kada Kirsi Gin is the cherry "
            "version."
        ),
    },
    {
        "slug": "moe-distillery",
        "name": "Moe Distillery",
        "old_names": ["Moe Distillery (Mohn)"],
        "country": "Estonia",
        "region": "Moe, Lääne-Viru County",
        "website": "https://moe.ee",
        "description": (
            "Spirits have been made at Moe Manor, near Tapa, since at least 1688, when a "
            "vodka kitchen is first recorded there. In the 1880s the pharmacist Jakob Kurberg "
            "bought the estate and built a modern distillery, and the old farm distillery now "
            "houses the Estonian Museum of the Distilling Industry. Mohn Island Poppy Gin is "
            "an unfiltered gin bottled at 45%, made from Estonian rye spirit with juniper "
            "hand-picked on the island of Muhu (called Mohn in 1688) and poppy seeds."
        ),
    },
    {
        "slug": "tohi-distillery",
        "name": "Tohi Distillery",
        "old_names": [],
        "country": "Estonia",
        "region": "Tohisoo, Kohila, Rapla County",
        "website": "https://tohigin.com",
        "description": (
            "A gin distillery in the former vodka kitchen of Tohisoo Manor in Kohila, about "
            "30 kilometres from Tallinn. The building made spirits in the 19th century and "
            "later belonged to a leather factory. It reopened as a distillery in 2018 under "
            "the restaurateur and master distiller Priit Palk. The gins are rye-based and "
            "flavoured with hand-picked berries, herbs and spices. Tohi Aronia Infused Gin is "
            "made once a year: Estonian aronia berries are crushed and steeped in the gin "
            "for about six months, then filtered and bottled at 38% with no added sugar."
        ),
    },
    {
        "slug": "edelranz",
        "name": "edelranz",
        "old_names": ["edelranz GmbH"],
        "country": "Germany",
        "region": "Mainz, Rhineland-Palatinate",
        "website": "https://edelranz.de",
        "description": (
            "A small spirits company in Mainz, whose gin was created by its founder Florian "
            "Polakovski, a former bartender. Its best-known product, edelranz Tinte Gin, is a "
            "dry gin bottled at 47% with ten botanicals. It is deep blue in the bottle and "
            "turns red when mixed, thanks to a natural botanical colouring. The flavour is "
            "led by juniper, then orange-led citrus, sweet wood and sandalwood, finishing "
            "with acacia blossom."
        ),
    },
    {
        "slug": "the-stin",
        "name": "The Stin",
        "old_names": [],
        "country": "Austria",
        "region": "Ehrenhausen an der Weinstraße, South Styria",
        "website": "https://www.stin.at",
        "description": (
            "A small gin producer in the South Styrian wine country; the name is short for "
            "'Styrian Gin'. It was founded in 2015 by Johannes Firmenich and Reinhard "
            "Jagerhofer, who met while studying in Vienna. Twenty-eight botanicals, among "
            "them South Styrian apples and East Styrian elderberry, are macerated for a few "
            "days, distilled in small batches in a 50-litre copper pot still and cut with "
            "Styrian spring water. The Stin Styrian Dry Gin Classic Proof is bottled at 47% "
            "and only lightly filtered, so it turns cloudy when mixed."
        ),
    },
    {
        "slug": "vinogin",
        "name": "Vinogin",
        "old_names": [],
        "country": "Austria",
        "region": "Innere Stadt, Vienna",
        "website": "https://gin-gallery.at/vinogin-bar/",
        "description": (
            "A gin and wine bar on Fleischmarkt in Vienna's first district, next to its "
            "sister business, the Gin Gallery, which has specialised in gin since 2012 and "
            "stocks more than 500 gins for tasting. Vinogin Vienna Dry Gin, bottled at 40%, "
            "is sold under the bar's own name. Falstaff lists a gin called Vinogin from "
            "Weinhaus Schumich in Oslip, Burgenland, which suggests it is made there for the "
            "bar."
        ),
    },
    {
        "slug": "kwv",
        "name": "KWV",
        "old_names": [],
        "country": "South Africa",
        "region": "Paarl, Western Cape",
        "website": "https://kwv.co.za",
        "description": (
            "Founded in Paarl in 1918 as a co-operative of Western Cape wine farmers, the "
            "Koöperatieve Wijnbouwers Vereniging van Zuid-Afrika, to stabilise the young "
            "South African wine industry. It is now a wine and spirits producer. KWV Cruxland "
            "Gin launched in 2015: a London Dry gin on a grape-spirit base with nine "
            "botanicals, among them rooibos, honeybush and Kalahari truffles. The truffles "
            "grow wild only after the first summer rains and are distilled separately; the "
            "name comes from the cross-shaped crack a truffle makes in the sand as it swells."
        ),
    },
    {
        "slug": "sash-fritz",
        "name": "Sash & Fritz",
        "old_names": [],
        "country": "Germany",
        "region": "Berlin",
        "website": "https://www.sashundfritz.de",
        "description": (
            "A Berlin spirits brand launched in 2015 by the sommelier and wine merchant Peter "
            "Steger, first known for its German wheat vodka. The name refers to the "
            "friendship between Tsar Alexander I of Russia and King Friedrich Wilhelm III of "
            "Prussia. Wild Child Berlin Dry Gin was introduced at the end of 2018. It is "
            "built on the same wheat spirit as the vodka, with wild juniper, rosemary, "
            "coriander, Calabrian citron and bergamot among its botanicals, and is bottled at "
            "43.5%."
        ),
    },
    {
        "slug": "stockholms-branneri",
        "name": "Stockholms Bränneri",
        "old_names": [],
        "country": "Sweden",
        "region": "Södermalm, Stockholm",
        "website": "https://www.stockholmsbranneri.com",
        "description": (
            "A small distillery in a former car workshop on Folkungagatan, on Södermalm in "
            "central Stockholm, founded by the married couple Anna and Calle Wikner. All of "
            "its gin is organic. Stockholms Bränneri Dry Gin uses seven organic botanicals: "
            "juniper, coriander, angelica root, lemon peel, heather, elderflower and "
            "rosemary. The distillery shares its building with Modernist Brewery and has its "
            "own cocktail bar, Brännerian."
        ),
    },
    {
        "slug": "herno-gin-distillery",
        "name": "Hernö Gin Distillery",
        "old_names": [],
        "country": "Sweden",
        "region": "Dala, Härnösand, Västernorrland",
        "website": "https://hernogin.com",
        "description": (
            "Sweden's first dedicated gin distillery, founded by Jon Hillgren in Dala, a "
            "village outside Härnösand on the High Coast, a UNESCO World Heritage Site. "
            "Hillgren had worked in London bars before training in brewing and distilling. "
            "The gin is made on hand-hammered German copper pot stills named after women "
            "linked to the farm. Hernö Gin is bottled at 40.5% and uses eight organic "
            "botanicals: juniper, coriander, fresh lemon peel, lingonberry, meadowsweet, "
            "black pepper, cassia and vanilla."
        ),
    },
    {
        "slug": "berliner-brandstifter",
        "name": "Berliner Brandstifter",
        "old_names": [],
        "country": "Germany",
        "region": "Berlin",
        "website": "https://berlinerbrandstifter.com",
        "description": (
            "A Berlin spirits company founded in 2009 by Vincent Honrodt, who cites a family "
            "tradition going back to his great-grandfather Ernst Honrodt, a sugar-factory "
            "director who distilled spirits near Berlin in the 1930s. Berliner Brandstifter "
            "Berlin Dry Gin is bottled at 43.3% in numbered bottles. Its botanicals, among "
            "them elderflower, mallow blossom, woodruff and fresh cucumber, are picked "
            "locally and macerated for several weeks before a single distillation."
        ),
    },
    {
        "slug": "maison-ferrand",
        "name": "Maison Ferrand",
        "old_names": ["Maison Ferrand (Château de Bonbonnet)"],
        "country": "France",
        "region": "Ars, Charente",
        "website": "https://maisonferrand.com",
        "description": (
            "A Cognac house founded in 1989 by Alexandre Gabriel, with its distillery at the "
            "Château de Bonbonnet in Ars, near Cognac. In 1996 it launched Citadelle gin, "
            "after persuading French customs that Cognac stills could be used for gin "
            "outside the Cognac distilling season. Citadelle is made with 19 botanicals on "
            "Charentais copper pot stills. Citadelle No Mistake Old Tom, from the 'Extrêmes' "
            "series, is aged in several kinds of cask and sweetened with toasted, "
            "barrel-aged cane sugar in the Old Tom style; the distillery cat, Tom, is on its "
            "label."
        ),
    },
    {
        "slug": "g-j-distillers",
        "name": "G&J Distillers",
        "old_names": ["G&J Greenall (Opihr)"],
        "country": "England",
        "region": "Birchwood, Warrington, Cheshire",
        "website": "https://quintessentialbrands.com",
        "description": (
            "The Warrington gin distillery behind Greenall's, which traces its origins to "
            "1761, when Thomas Dakin began distilling in the town. The Greenall family took "
            "over in 1860 and the business became G&J Greenall; its owner, Quintessential "
            "Brands, renamed it G&J Distillers in 2013. Opihr Oriental Spiced London Dry Gin "
            "was launched in 2013 and is distilled here, with cubeb berries from Indonesia, "
            "cardamom from Tanzania, Tellicherry black pepper from India and coriander from "
            "Morocco. The site also makes Greenall's, BLOOM and Thomas Dakin gins."
        ),
    },
    {
        "slug": "det-norske-brenneri",
        "name": "Det Norske Brenneri",
        "old_names": [],
        "country": "Norway",
        "region": "Grimstad, Agder",
        "website": "https://detnorskebrenneri.no",
        "description": (
            "A distillery in Grimstad on Norway's southern coast, set up by Odd Johan Nelvik "
            "and often described as Norway's first private distillery after the state "
            "monopoly on spirits production ended. Its Harahorn gin, named after a mythical "
            "horned hare from Hemsedal folklore, launched in 2015, with Norwegian botanicals "
            "including Røros juniper, blueberries, Grimstad rhubarb and Oppdal angelica. "
            "Harahorn Pink Gin is the classic Harahorn with raspberry extract and "
            "fresh-pressed lemon juice added after distillation."
        ),
    },
    {
        "slug": "antica-distilleria-quaglia",
        "name": "Antica Distilleria Quaglia",
        "old_names": ["Imea / Distilleria Quaglia"],
        "country": "Italy",
        "region": "Castelnuovo Don Bosco, Piedmont",
        "website": "",
        "description": (
            "A family-run distillery in Castelnuovo Don Bosco, in the hills of the province "
            "of Asti, founded in 1890 and owned by the Quaglia family since 1906. It makes "
            "grappa, liqueurs, vermouth and gin, using botanicals grown on its own estate. "
            "It produces Imea Gineprina d'Olanda, which the drinks writer Fulvio Piccinino "
            "developed with the distillery from an 1897 recipe found in a rare Italian book "
            "of liqueur recipes. The gin keeps the period spicing: juniper with anise, "
            "cloves, cinnamon and mace."
        ),
    },
    {
        "slug": "nordic-premium-beverages",
        "name": "Nordic Premium Beverages",
        "old_names": ["Nordic Premium Beverages (Oath)"],
        "country": "Finland",
        "region": "Ilomantsi, North Karelia",
        "website": "https://nordicpremiumbeverages.com",
        "description": (
            "A winery and distillery in Ilomantsi, eastern Finland, formerly known as "
            "Hermannin Viinitila and established in 1989. It is named as the distillery "
            "behind Oath Gin, created by the Finnish Formula 1 driver Valtteri Bottas and "
            "the Australian cyclist Tiffany Cromwell. Oath is vacuum-distilled from oats "
            "grown on the Bottas family's fields, apples from near Cromwell's home town in "
            "South Australia and Finnish spring water, and is bottled at 42.7%."
        ),
    },
    {
        "slug": "henkell-freixenet-polska",
        "name": "Henkell Freixenet Polska",
        "old_names": ["Lubuska Wytwórnia Wódek Gatunkowych (Polmos Zielona Góra)"],
        "country": "Poland",
        "region": "Toruń, Kuyavian-Pomeranian",
        "website": "",
        "description": (
            "The Polish arm of the German Henkell Freixenet group, which grew from the Toruń "
            "wine company Vinpol. It owns and makes Lubuski Gin, including Lubuski Gin "
            "Original. The gin was created in the 1980s at the state distillery Polmos "
            "Zielona Góra (Lubuska Wytwórnia Wódek Gatunkowych). After Pernod Ricard took "
            "over the Polmos owner V&S in 2008, it sold Lubuski Gin to Vinpol in 2009, and "
            "production has since moved to Toruń."
        ),
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

DETAIL_FIELDS = ("country", "region", "website", "description")


def upgrade() -> None:
    """Add the distilleries that aren't there yet; complete the ones that are."""
    conn = op.get_bind()
    current = conn.execute(
        sa.select(
            distilleries.c.id,
            distilleries.c.slug,
            distilleries.c.name,
            distilleries.c.country,
            distilleries.c.region,
            distilleries.c.website,
            distilleries.c.description,
            distilleries.c.version,
        )
    ).all()
    # Compare names in Python: SQLite's lower() doesn't handle letters like Å.
    by_slug = {row.slug: row for row in current}
    by_name = {row.name.lower(): row for row in current}
    now = datetime.now(UTC)
    new_rows = []

    for d in DISTILLERIES:
        names = [d["name"], *d["old_names"]]
        row = by_slug.get(d["slug"]) or next(
            (by_name[n.lower()] for n in names if n.lower() in by_name), None
        )
        if row is None:
            new_rows.append(
                {
                    "id": uuid.uuid4(),
                    "slug": d["slug"],
                    "name": d["name"],
                    **{field: d[field] or None for field in DETAIL_FIELDS},
                    "created_at": now,
                    "updated_at": now,
                    "version": 1,
                }
            )
            continue

        values = {}
        # Rename only from an old import name, never a name someone typed.
        if row.name.lower() in (n.lower() for n in d["old_names"]):
            values["name"] = d["name"]
            # The importer made its URL name from the old name, e.g.
            # "edelranz-gmbh"; use the clean one if nothing else has it.
            if d["slug"] not in by_slug:
                values["slug"] = d["slug"]
        for field in DETAIL_FIELDS:
            if not getattr(row, field) and d[field]:
                values[field] = d[field]
        if values:
            # A new version number makes an open edit form show a conflict
            # instead of silently overwriting these changes.
            values.update(updated_at=now, version=row.version + 1)
            conn.execute(distilleries.update().where(distilleries.c.id == row.id).values(**values))

    if new_rows:
        op.bulk_insert(distilleries, new_rows)


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
