"""Turn the photo-survey CSVs into a file The Gin Cabinet's importer accepts.

Why this script exists
----------------------
The gins were first listed from 45 bottle photos into two "research" files:

* ``source/gins.csv``         - one row per gin, with our own extra columns
                                (slug, size_ml, confidence, photo, notes ...)
* ``source/distilleries.csv`` - one row per producer

The app's importer (``apps/api/app/api/routes/admin_data.py``) expects a
different layout: ONE file with the columns in ``IMPORT_COLUMNS`` below. It
also checks every value with the same rules as the admin forms, e.g. the
``style`` must be one of the app's fixed styles and ``abv`` must be filled in.

This script reads the two research files, fixes the values the importer would
reject, and writes ``gins_for_import.csv``.

How to run it (from the repository's top folder)::

    python3 import/prepare_gin_import.py

It only uses Python's standard library, so nothing needs installing.
"""

import csv  # reads and writes CSV files
from pathlib import Path  # a convenient way to build file paths

# ``__file__`` is this script's own path, so the script works no matter which
# folder you run it from.
HERE = Path(__file__).resolve().parent
SOURCE_GINS = HERE / "source" / "gins.csv"
SOURCE_DISTILLERIES = HERE / "source" / "distilleries.csv"
OUTPUT = HERE / "gins_for_import.csv"

# The exact column order the importer reads (and its CSV export writes).
IMPORT_COLUMNS = [
    "brand",
    "name",
    "edition",
    "style",
    "abv",
    "country",
    "distillery",
    "botanicals",
    "public_visible",
    "description",
]

# ---------------------------------------------------------------------------
# 1. Styles. The app only allows these values (see GinStyle in
#    apps/api/app/models/catalogue.py): london_dry, distilled, plymouth,
#    old_tom, navy_strength, new_western, genever, sloe, flavoured,
#    barrel_aged, other.
#    The research file used free text, so we translate it here. Anything that
#    starts with "Flavoured" (e.g. "Flavoured (lime)") is handled in code below.
# ---------------------------------------------------------------------------
STYLE_MAP = {
    "London Dry": "london_dry",
    "Dry Gin": "distilled",  # "Dry Gin" on a label = a distilled gin
    "Nordic Dry": "distilled",
    "Blended Dry": "distilled",
    "Rye Gin": "distilled",
    "Plymouth Gin": "plymouth",
    "Old Tom": "old_tom",
    "Navy Strength": "navy_strength",
    "New Western": "new_western",
    "Contemporary": "new_western",  # Hendrick's: cucumber & rose led
    "Pink": "flavoured",
    "Pink / Flavoured": "flavoured",
    "Colour-changing": "other",  # butterfly-pea gins: no matching style
    "Historic / Dutch-style": "other",  # Imea: an Italian 1897 recipe
}

# ---------------------------------------------------------------------------
# 2. ABV corrections, checked against producers and retailers on 2026-11-17.
#    Keyed by the research file's "slug" column.
# ---------------------------------------------------------------------------
ABV_CORRECTIONS = {
    # Not on the photo. Junimperium's other cherry gins (Cherry Infused and
    # Barrel Finished Cherry) are both 40%. Check the bottle to be sure.
    "junimperium-cherry": "40",
    # Not on the photo. 46% per Distiller, Flaviar, Caskers and Nick's.
    "citadelle-no-mistake-old-tom": "46",
    # Was 44 (label partly hidden). 45% per Teerenpeli, Tallink and Distiller.
    "teerenpeli-pyy-gin": "45",
    # Was 40 (from memory). The standard Lubuski Gin is 37.5% (Master of Malt);
    # 40% is the Lubuski 7 Year Old.
    "lubuski-original": "37.5",
}

# ---------------------------------------------------------------------------
# 3. Names. The app shows a gin as  "<brand> <name> (<edition>)", so the name
#    must NOT repeat the brand, or you'd see "Cubical Cubical ...".
#    Most rows are fixed automatically by strip_brand() below; these are the
#    ones that need a hand-written name and/or edition.
#    Bottle-specific details (batch, bottle number) are left out: they belong
#    on the bottle/purchase record, not on the catalogue entry for the gin.
# ---------------------------------------------------------------------------
NAME_OVERRIDES = {
    # slug: (name, edition)
    "cubical-ultra-premium": ("London Dry Gin", "Ultra Premium"),
    "junimperium-cherry": ("Cherry Edition", ""),
    "plymouth-original": ("Gin", "Original Strength"),
    "kada-kirsi": ("Kirsi Gin", ""),
    "stockholms-branneri-dry": ("Dry Gin", ""),  # was "Batch 6"
    "berliner-brandstifter-dry": ("Berlin Dry Gin", ""),  # was "Edition 7/2019 bottle 368/9999"
    "imea-gineprina-dolanda": ("Gineprina d'Olanda", ""),  # "1897 recipe" is a description
}

# 4. Producer name fixes (keyed by the distillery slug).
DISTILLERY_NAME_OVERRIDES = {
    # The company behind Arctic Blue Gin is Arctic Blue Beverages Oy.
    "arctic-brands": "Arctic Blue Beverages",
}


def strip_brand(brand: str, full_name: str) -> str:
    """Remove the brand from the front of the product name.

    >>> strip_brand("Tanqueray", "Tanqueray Rangpur")
    'Rangpur'
    >>> strip_brand("Hendrick's", "Hendrick's Gin")
    'Gin'
    """
    if full_name.lower().startswith(brand.lower() + " "):
        return full_name[len(brand) + 1 :].strip()
    return full_name


def convert_style(text: str) -> str:
    """Translate a free-text style into one of the app's fixed styles."""
    if text.startswith("Flavoured"):
        return "flavoured"
    if text not in STYLE_MAP:
        # Stop loudly instead of guessing: add the new style to STYLE_MAP.
        raise ValueError(f"Unknown style {text!r} - add it to STYLE_MAP")
    return STYLE_MAP[text]


def read_csv(path: Path) -> list[dict[str, str]]:
    # ``newline=""`` lets the csv module handle line endings itself, and
    # "utf-8" keeps letters like å, ä, ö and ę intact.
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    # Build a lookup "slug -> distillery name" so each gin can name its producer.
    distillery_names = {}
    for row in read_csv(SOURCE_DISTILLERIES):
        slug = row["slug"]
        distillery_names[slug] = DISTILLERY_NAME_OVERRIDES.get(slug, row["name"])

    output_rows = []
    for row in read_csv(SOURCE_GINS):
        slug = row["slug"]

        if slug in NAME_OVERRIDES:
            name, edition = NAME_OVERRIDES[slug]
        else:
            name, edition = strip_brand(row["brand"], row["name"]), row["edition"]

        abv = ABV_CORRECTIONS.get(slug, row["abv"])
        if not abv:
            raise ValueError(f"{slug}: no ABV - the importer would reject this row")

        output_rows.append(
            {
                "brand": row["brand"],
                "name": name,
                "edition": edition,
                "style": convert_style(row["style"]),
                "abv": abv,
                "country": row["country"],
                "distillery": distillery_names[row["distillery_slug"]],
                "botanicals": "",  # not recorded from the photos
                # "no" = imported as hidden, so you can check each gin and add
                # photos/descriptions before it appears on the public site.
                "public_visible": "no",
                "description": "",
            }
        )

    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=IMPORT_COLUMNS)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Wrote {len(output_rows)} gins to {OUTPUT}")


# This block runs only when the file is run directly (not when imported).
if __name__ == "__main__":
    main()
