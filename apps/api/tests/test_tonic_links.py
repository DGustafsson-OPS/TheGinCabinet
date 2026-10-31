"""Tonics linked to cocktails and to gins, shown on both sides."""

from tests.test_catalogue import make_gin
from tests.test_cocktails import create as create_cocktail
from tests.test_cocktails import publish as publish_cocktail
from tests.test_tonics import make_tonic

TONICS = "/api/v1/admin/tonics"
COCKTAILS = "/api/v1/admin/cocktails"
PUBLIC = "/api/v1/public"


def test_cocktail_tonics_both_ways(api, client):
    fever = make_tonic(api)
    secret = make_tonic(api, brand="Secret", name="Tonic", public_visible=False)
    recipe = create_cocktail(
        api,
        tonics=[
            {"tonic_id": fever["id"], "pairing_note": "  Light and dry  "},
            {"tonic_id": secret["id"]},
        ],
    )
    # The editor sees both, in order, with a warning flag for the private one.
    assert [(t["tonic"]["slug"], t["tonic_public"]) for t in recipe["tonics"]] == [
        (fever["slug"], True),
        (secret["slug"], False),
    ]
    assert recipe["tonics"][0]["pairing_note"] == "Light and dry"

    # Drafts aren't listed on the tonic's page yet.
    assert client.get(f"{PUBLIC}/tonics/{fever['slug']}").json()["cocktails"] == []
    publish_cocktail(api, recipe)

    page = client.get(f"{PUBLIC}/cocktails/{recipe['slug']}").json()
    assert [t["slug"] for t in page["recommended_tonics"]] == [fever["slug"]]  # private hidden
    assert page["recommended_tonics"][0]["pairing_note"] == "Light and dry"
    tonic_page = client.get(f"{PUBLIC}/tonics/{fever['slug']}").json()
    assert [c["slug"] for c in tonic_page["cocktails"]] == [recipe["slug"]]

    # Re-saving the same tonic, reordered, works (rows are reused, not duplicated).
    current = api.get(f"{COCKTAILS}/{recipe['id']}").json()
    r = api.patch(
        f"{COCKTAILS}/{recipe['id']}",
        json={
            "version": current["version"],
            "tonics": [{"tonic_id": secret["id"]}, {"tonic_id": fever["id"]}],
        },
    )
    assert r.status_code == 200, r.text
    assert [t["tonic"]["slug"] for t in r.json()["tonics"]] == [secret["slug"], fever["slug"]]

    # Each tonic once.
    r = api.patch(
        f"{COCKTAILS}/{recipe['id']}",
        json={
            "version": r.json()["version"],
            "tonics": [{"tonic_id": fever["id"]}, {"tonic_id": fever["id"]}],
        },
    )
    assert r.status_code == 422

    # Deleting a tonic just removes the link from the cocktail.
    assert api.delete(f"{TONICS}/{fever['id']}").status_code == 204
    assert [
        t["tonic"]["slug"] for t in api.get(f"{COCKTAILS}/{recipe['id']}").json()["tonics"]
    ] == [secret["slug"]]


def test_gins_a_tonic_suits_both_ways(api, client):
    hendricks = make_gin(api, public_visible=True)
    private_gin = make_gin(api, brand="Secret", public_visible=False)
    tonic = make_tonic(
        api,
        gins=[
            {"gin_id": hendricks["id"], "pairing_note": "Cucumber and rose"},
            {"gin_id": private_gin["id"]},
        ],
    )
    assert [(g["gin"]["slug"], g["gin_public"]) for g in tonic["gins"]] == [
        (hendricks["slug"], True),
        (private_gin["slug"], False),
    ]

    tonic_page = client.get(f"{PUBLIC}/tonics/{tonic['slug']}").json()
    assert [g["slug"] for g in tonic_page["gins"]] == [hendricks["slug"]]  # private hidden
    assert tonic_page["gins"][0]["pairing_note"] == "Cucumber and rose"
    gin_page = client.get(f"{PUBLIC}/gins/{hendricks['slug']}").json()
    assert [(t["slug"], t["pairing_note"]) for t in gin_page["tonics"]] == [
        (tonic["slug"], "Cucumber and rose")
    ]

    # A private tonic isn't shown on the gin's page.
    r = api.patch(
        f"{TONICS}/{tonic['id']}", json={"version": tonic["version"], "public_visible": False}
    )
    assert r.json()["gins"][0]["gin"]["slug"] == hendricks["slug"]  # the list is kept
    assert client.get(f"{PUBLIC}/gins/{hendricks['slug']}").json()["tonics"] == []

    # Editing the list replaces it; each gin once; unknown gins are refused.
    r = api.patch(f"{TONICS}/{tonic['id']}", json={"version": r.json()["version"], "gins": []})
    assert r.json()["gins"] == []
    version = r.json()["version"]
    twice = [{"gin_id": hendricks["id"]}, {"gin_id": hendricks["id"]}]
    r = api.patch(f"{TONICS}/{tonic['id']}", json={"version": version, "gins": twice})
    assert r.status_code == 422
    unknown = [{"gin_id": "00000000-0000-0000-0000-000000000000"}]
    r = api.patch(f"{TONICS}/{tonic['id']}", json={"version": version, "gins": unknown})
    assert r.status_code == 404

    # Deleting the tonic deletes its gin links too.
    api.patch(
        f"{TONICS}/{tonic['id']}",
        json={"version": version, "gins": [{"gin_id": hendricks["id"]}]},
    )
    assert api.delete(f"{TONICS}/{tonic['id']}").status_code == 204
    assert client.get(f"{PUBLIC}/gins/{hendricks['slug']}").json()["tonics"] == []
