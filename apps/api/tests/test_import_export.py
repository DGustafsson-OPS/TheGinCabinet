"""CSV import and data export (spec §6 "Imports and export", §11)."""

import csv
import io

from tests.test_catalogue import make_gin

IMPORT = "/api/v1/admin/import/gins"

GOOD_CSV = """brand,name,edition,style,abv,country,distillery,botanicals,public_visible
Tanqueray,London Dry Gin,,London Dry,43.1,England,Diageo,juniper|coriander|angelica,yes
Hernö,Swedish Excellence,,london_dry,"40,5%",Sweden,Hernö Gin,juniper|meadowsweet,no
TANQUERAY,london dry gin,,london_dry,43.1,England,Diageo,,no
Hendrick's,Gin,,distilled,41.4,Scotland,,,no
Broken,Gin,,london_dry,150,Nowhere,,,no
,Nameless,,other,40,,,,no
"""


def upload(api, text: str, dry_run: bool = True):
    return api.post(
        IMPORT,
        params={"dry_run": str(dry_run).lower()},
        files={"file": ("gins.csv", text.encode(), "text/csv")},
    )


def test_import_preview_saves_nothing(api):
    make_gin(api)  # Hendrick's is already in the catalogue
    r = upload(api, GOOD_CSV)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["dry_run"] is True
    assert result["total_rows"] == 6
    assert [c["row"] for c in result["created"]] == [2, 3]
    assert [(d["row"], d["reasons"][0]) for d in result["duplicates"]] == [
        (4, "Same gin as row 2"),
        (5, "Already in the catalogue as Hendrick's Gin"),
    ]
    rejected = {r["row"]: r["reasons"] for r in result["rejected"]}
    assert set(rejected) == {6, 7}
    assert rejected[6][0].startswith("abv:")  # actionable reason (spec §11)
    assert rejected[7][0].startswith("brand:")
    assert result["new_distilleries"] == ["Diageo", "Hernö Gin"]

    # Nothing was saved.
    assert api.get("/api/v1/admin/gins").json()["meta"]["total"] == 1


def test_import_for_real(api):
    r = upload(api, GOOD_CSV, dry_run=False)
    assert len(r.json()["created"]) == 3  # Hendrick's is new this time
    gins = {g["slug"]: g for g in api.get("/api/v1/admin/gins").json()["items"]}
    herno = gins["herno-swedish-excellence"]
    assert herno["abv"] == "40.50"  # "40,5%" understood
    assert herno["distillery"]["name"] == "Hernö Gin"
    assert gins["tanqueray-london-dry-gin"]["public_visible"] is True
    assert gins["tanqueray-london-dry-gin"]["botanicals"] == ["angelica", "coriander", "juniper"]

    audit = api.get("/api/v1/admin/audit", params={"action": "import.gins"}).json()["items"]
    assert audit[0]["summary"]["created"] == 3


def test_import_reads_semicolon_csv_from_excel(api):
    text = "﻿brand;name;abv\nGin Mare;Mediterranean Gin;42,7\n"
    r = upload(api, text, dry_run=False)
    assert [c["name"] for c in r.json()["created"]] == ["Gin Mare Mediterranean Gin"]


def test_import_rejects_wrong_columns(api):
    r = upload(api, "title,strength\nX,40\n")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "missing_columns"


def test_csv_export_roundtrips_and_blocks_formulas(api):
    make_gin(api, description='=HYPERLINK("http://evil")', botanicals=["juniper", "rose"])
    r = api.get("/api/v1/admin/export/gins.csv")
    assert r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert rows[0]["botanicals"] == "juniper|rose"
    assert rows[0]["description"].startswith("'=")  # neutralised for Excel

    # The exported file can be imported again; everything is a duplicate.
    again = upload(api, r.text).json()
    assert len(again["duplicates"]) == 1


def test_full_export(api):
    gin = make_gin(api)
    api.post("/api/v1/admin/bottles", json={"gin_id": gin["id"], "size_ml": 700})
    r = api.get("/api/v1/admin/export")
    data = r.json()
    assert data["format"] == "gin-cabinet-export"
    assert len(data["gins"]) == 1
    assert len(data["bottles"]) == 1
    assert data["bottles"][0]["events"][0]["to_status"] == "sealed"
    assert "password_hash" not in r.text
