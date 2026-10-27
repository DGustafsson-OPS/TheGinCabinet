"""Cocktail recipes: editor, publishing, scaling and gin pairings (spec §5 A07, P06–P07, §11)."""

import pytest

from tests.test_catalogue import make_gin

ADMIN = "/api/v1/admin/cocktails"
PUBLIC = "/api/v1/public/cocktails"

GIN_AND_TONIC = {
    "title": "Classic Gin & Tonic",
    "intro": "The perfect serve.",
    "method": "build",
    "glassware": "Copa glass",
    "prep_minutes": 3,
    "servings_base": 1,
    "garnish": "lime wheels",
    "garnish_quantity": "2",
    "tags": ["Refreshing", "classic", "refreshing"],
    "ingredients": [
        {"name": "Gin", "quantity": "50", "unit": "ml"},
        {"name": "Tonic water", "unit": "top up"},
        {"name": "Angostura bitters", "quantity": "1.5", "unit": "dash", "optional": True},
    ],
    "steps": [
        {"text": "Fill a copa glass with ice."},
        {"text": "Add 50 ml gin, then top up with tonic."},
    ],
}


def create(api, **overrides) -> dict:
    r = api.post(ADMIN, json={**GIN_AND_TONIC, **overrides})
    assert r.status_code == 201, r.text
    return r.json()


def publish(api, recipe: dict):
    return api.post(
        f"{ADMIN}/{recipe['id']}/publish",
        json={"version": recipe["version"], "status": "published"},
    )


def test_create_recipe_with_reusable_ingredients(api):
    recipe = create(api)
    assert recipe["status"] == "draft"
    assert recipe["slug"] == "classic-gin-tonic"
    assert recipe["tags"] == ["refreshing", "classic"]  # cleaned + de-duplicated
    assert [i["quantity"] for i in recipe["ingredients"]] == ["50", None, "1.5"]
    assert recipe["steps"][0] == "Fill a copa glass with ice."

    # A second recipe reuses "gin" instead of creating a duplicate ingredient.
    create(api, title="Gin Rickey", ingredients=[{"name": "GIN", "quantity": "60", "unit": "ml"}])
    names = [i["name"] for i in api.get("/api/v1/admin/ingredients").json()]
    assert names == ["Angostura bitters", "Gin", "Tonic water"]


@pytest.mark.parametrize(
    "line",
    [
        {"name": "Tonic", "quantity": "100", "unit": "top up"},  # "top up" has no amount
        {"name": "Gin", "quantity": "0", "unit": "ml"},
        {"name": "Gin", "quantity": "50", "unit": "fluid ounce"},  # metric only
    ],
)
def test_ingredient_lines_are_validated(api, line):
    r = api.post(ADMIN, json={**GIN_AND_TONIC, "ingredients": [line]})
    assert r.status_code == 422


def test_drafts_are_private_and_publishing_needs_content(api, client):
    recipe = create(api, ingredients=[], steps=[])
    assert client.get(f"{PUBLIC}/{recipe['slug']}").status_code == 404

    r = publish(api, recipe)
    assert r.json()["error"]["code"] == "not_publishable"
    assert len(r.json()["error"]["details"]) == 2

    recipe = api.patch(
        f"{ADMIN}/{recipe['id']}",
        json={
            "version": recipe["version"],
            "ingredients": GIN_AND_TONIC["ingredients"],
            "steps": GIN_AND_TONIC["steps"],
        },
    ).json()
    assert publish(api, recipe).json()["status"] == "published"
    assert client.get(PUBLIC).json()["meta"]["total"] == 1
    page = client.get(f"{PUBLIC}/{recipe['slug']}").json()
    for private in ("id", "status", "author", "version", "cover_media_id"):
        assert private not in page

    # Withdraw → gone again.
    recipe = api.get(f"{ADMIN}/{recipe['id']}").json()
    api.post(
        f"{ADMIN}/{recipe['id']}/status", json={"version": recipe["version"], "status": "draft"}
    )
    assert client.get(f"{PUBLIC}/{recipe['slug']}").status_code == 404


def test_scaling_changes_numbers_not_text(api, client):
    """Spec §11: serving scaling changes numerical quantities and not method text."""
    recipe = create(api)
    publish(api, recipe)

    one = client.get(f"{PUBLIC}/{recipe['slug']}").json()
    four = client.get(f"{PUBLIC}/{recipe['slug']}", params={"servings": 4}).json()

    assert one["servings"] == 1 and four["servings"] == 4
    assert [i["quantity"] for i in four["ingredients"]] == ["200", None, "6"]
    assert four["garnish_quantity"] == "8"  # 2 lime wheels × 4
    assert four["garnish"] == "lime wheels"
    assert four["steps"] == one["steps"]  # "Add 50 ml gin…" is NOT rewritten
    assert four["steps"][1] == "Add 50 ml gin, then top up with tonic."

    assert client.get(f"{PUBLIC}/{recipe['slug']}", params={"servings": 13}).status_code == 422


def test_scaling_from_a_multi_serving_recipe(api, client):
    recipe = create(
        api,
        title="Punch",
        servings_base=4,
        ingredients=[
            {"name": "Gin", "quantity": "200", "unit": "ml"},
            {"name": "Sugar syrup", "quantity": "25", "unit": "ml"},
        ],
    )
    publish(api, recipe)
    three = client.get(f"{PUBLIC}/{recipe['slug']}", params={"servings": 3}).json()
    assert [i["quantity"] for i in three["ingredients"]] == ["150", "18.75"]


def test_gin_pairings_agree_in_both_directions(api, client):
    """Spec §11: recommendations on gin profile and recipe page stay consistent."""
    public_gin = make_gin(api, public_visible=True)
    private_gin = make_gin(api, brand="Secret", public_visible=False)
    recipe = create(
        api,
        gins=[
            {"gin_id": private_gin["id"], "priority": 1, "pairing_note": "Unreleased"},
            {"gin_id": public_gin["id"], "priority": 2, "pairing_note": "Cucumber loves tonic"},
        ],
    )
    publish(api, recipe)

    page = client.get(f"{PUBLIC}/{recipe['slug']}").json()
    assert [g["slug"] for g in page["recommended_gins"]] == [public_gin["slug"]]  # private hidden
    assert page["recommended_gins"][0]["pairing_note"] == "Cucumber loves tonic"

    from_gin = client.get(f"/api/v1/public/gins/{public_gin['slug']}/cocktails").json()
    assert [c["slug"] for c in from_gin] == [recipe["slug"]]
    assert client.get(f"/api/v1/public/gins/{private_gin['slug']}/cocktails").status_code == 404

    # The admin view shows both, with a warning flag for the private one.
    admin_view = api.get(f"{ADMIN}/{recipe['id']}").json()
    assert [(g["gin"]["slug"], g["gin_public"]) for g in admin_view["gins"]] == [
        (private_gin["slug"], False),
        (public_gin["slug"], True),
    ]


def test_same_gin_cannot_be_paired_twice(api):
    gin = make_gin(api)
    r = api.post(
        ADMIN, json={**GIN_AND_TONIC, "gins": [{"gin_id": gin["id"]}, {"gin_id": gin["id"]}]}
    )
    assert r.json()["error"]["code"] == "duplicate_pairing"


def test_public_filters(api, client):
    publish(api, create(api))
    publish(
        api,
        create(
            api,
            title="Martini",
            intro="Cold and clear.",
            method="stir",
            difficulty="medium",
            tags=["strong"],
        ),
    )
    titles = lambda r: [c["title"] for c in r.json()["items"]]  # noqa: E731
    assert titles(client.get(PUBLIC, params={"method": "stir"})) == ["Martini"]
    assert titles(client.get(PUBLIC, params={"difficulty": "easy"})) == ["Classic Gin & Tonic"]
    assert titles(client.get(PUBLIC, params={"tag": "Strong"})) == ["Martini"]
    assert titles(client.get(PUBLIC, params={"search": "perfect"})) == ["Classic Gin & Tonic"]


def test_list_edits_bump_version_and_conflict(api):
    recipe = create(api)
    updated = api.patch(
        f"{ADMIN}/{recipe['id']}", json={"version": 1, "steps": [{"text": "Stir."}]}
    ).json()
    assert updated["version"] == 2 and updated["steps"] == ["Stir."]
    stale = api.patch(f"{ADMIN}/{recipe['id']}", json={"version": 1, "title": "Old copy"})
    assert stale.status_code == 409


def test_cocktail_cover_counts_as_media_use(api):
    from tests.test_editorial import jpeg_with_gps, upload

    image = upload(api, jpeg_with_gps(), alt="A G&T").json()
    create(api, cover_media_id=image["id"])
    assert api.delete(f"/api/v1/admin/media/{image['id']}").status_code == 409


def test_resaving_the_same_gin_pairing_works(api):
    """Replacing the pairing list with the same gin must not hit the unique rule."""
    gin = make_gin(api)
    recipe = create(api, gins=[{"gin_id": gin["id"], "pairing_note": "Old note"}])
    r = api.patch(
        f"{ADMIN}/{recipe['id']}",
        json={
            "version": recipe["version"],
            "gins": [{"gin_id": gin["id"], "priority": 2, "pairing_note": "New note"}],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["gins"][0]["pairing_note"] == "New note"
    assert r.json()["gins"][0]["priority"] == 2
