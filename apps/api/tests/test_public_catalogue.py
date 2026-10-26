"""The public catalogue: collection, gin pages, distilleries, stats (spec §4, §6, §11)."""

from tests.test_catalogue import make_gin
from tests.test_editorial import jpeg_with_gps, upload

GINS = "/api/v1/public/gins"
ADMIN_GINS = "/api/v1/admin/gins"


def all_keys(value) -> set[str]:
    """Every field name anywhere inside a JSON value."""
    if isinstance(value, dict):
        return set(value) | set().union(*(all_keys(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(all_keys(v) for v in value)) if value else set()
    return set()


def publish_review(api, gin, rating: str, title: str = "Review"):
    review = api.post(
        "/api/v1/admin/reviews",
        json={"gin_id": gin["id"], "title": title, "verdict": "Good.", "rating": rating},
    ).json()
    review = api.post(
        f"/api/v1/admin/reviews/{review['id']}/status",
        json={"version": review["version"], "status": "ready"},
    ).json()
    return api.post(
        f"/api/v1/admin/reviews/{review['id']}/status",
        json={"version": review["version"], "status": "published"},
    ).json()


def test_only_public_gins_and_no_private_fields(api, client):
    """Spec §11: public pages disclose only explicitly approved gin profiles."""
    public = make_gin(api, public_visible=True)
    private = make_gin(api, brand="Secret", public_visible=False)
    buy = {
        "purchased_on": "2026-10-01",
        "retailer": "Shop",
        "currency": "SEK",
        "lines": [{"gin_id": public["id"], "size_ml": 700, "quantity": 3, "unit_price": "499"}],
    }
    api.post("/api/v1/admin/purchases", json=buy)

    listing = client.get(GINS).json()
    assert [g["slug"] for g in listing["items"]] == [public["slug"]]
    assert client.get(f"{GINS}/{private['slug']}").status_code == 404

    page = client.get(f"{GINS}/{public['slug']}")
    # No prices, counts, shelves, purchases or internal ids (spec P02/P03).
    # Check field *names* exactly: searching the text for "499" could match a
    # timestamp's microseconds by chance.
    private_fields = {
        "id",
        "unit_price",
        "price",
        "total",
        "bottles",
        "bottles_in_cabinet",
        "bottles_total",
        "shelf",
        "purchase",
        "purchase_id",
        "retailer",
        "version",
        "public_visible",
        "email",
    }
    assert not all_keys(page.json()) & private_fields
    assert "499.00" not in page.text
    assert public["id"] not in page.text
    assert page.json()["collection_status"] == "owned"


def test_collection_badge_changes_when_bottles_are_finished(api, client):
    gin = make_gin(api, public_visible=True)
    assert client.get(f"{GINS}/{gin['slug']}").json()["collection_status"] is None
    bottle = api.post("/api/v1/admin/bottles", json={"gin_id": gin["id"], "size_ml": 700}).json()[0]
    assert client.get(f"{GINS}/{gin['slug']}").json()["collection_status"] == "owned"
    api.post(
        f"/api/v1/admin/bottles/{bottle['id']}/status", json={"version": 1, "status": "gifted"}
    )
    assert client.get(f"{GINS}/{gin['slug']}").json()["collection_status"] == "previously_owned"


def test_filters_search_and_sort(api, client):
    make_gin(
        api,
        brand="Hernö",
        name="Swedish Excellence",
        abv="40.5",
        country="Sweden",
        style="london_dry",
        public_visible=True,
        botanicals=["juniper", "meadowsweet"],
    )
    make_gin(
        api,
        brand="Monkey 47",
        name="Schwarzwald",
        abv="47",
        country="Germany",
        style="distilled",
        public_visible=True,
        botanicals=["juniper", "spruce"],
    )
    tanq = make_gin(
        api,
        brand="Tanqueray",
        name="No. Ten",
        abv="47.3",
        country="Scotland",
        style="distilled",
        public_visible=True,
        botanicals=["grapefruit"],
    )
    brands = lambda r: [g["brand"] for g in r.json()["items"]]  # noqa: E731

    assert brands(client.get(GINS, params={"search": "swed"})) == ["Hernö"]  # country/name
    assert brands(client.get(GINS, params={"style": "distilled"})) == ["Monkey 47", "Tanqueray"]
    assert brands(client.get(GINS, params={"country": "germany"})) == ["Monkey 47"]
    assert brands(client.get(GINS, params={"botanical": "Spruce"})) == ["Monkey 47"]
    assert brands(client.get(GINS, params={"abv_min": "45", "abv_max": "47.1"})) == ["Monkey 47"]
    assert brands(client.get(GINS, params={"sort": "abv"})) == ["Tanqueray", "Monkey 47", "Hernö"]

    publish_review(api, tanq, "9")
    assert brands(client.get(GINS, params={"min_rating": "8"})) == ["Tanqueray"]
    assert brands(client.get(GINS, params={"sort": "rating"}))[0] == "Tanqueray"

    facets = client.get(f"{GINS}/facets").json()
    assert facets["countries"] == ["Germany", "Scotland", "Sweden"]
    assert "meadowsweet" in facets["botanicals"]


def test_gin_page_has_reviews_cocktails_images_and_related(api, client):
    photo = upload(api, jpeg_with_gps(), alt="Bottle").json()
    gin = make_gin(
        api,
        public_visible=True,
        botanicals=["juniper", "cucumber", "rose"],
        image_ids=[photo["id"]],
    )
    cousin = make_gin(api, brand="Cousin", public_visible=True, botanicals=["cucumber", "rose"])
    make_gin(api, brand="Stranger", style="sloe", public_visible=True, botanicals=["sloe"])
    make_gin(api, brand="Hidden twin", public_visible=False, botanicals=["cucumber", "rose"])

    publish_review(api, gin, "8.5", title="Lovely")
    publish_review(api, gin, "7.5", title="Fine")
    recipe = api.post(
        "/api/v1/admin/cocktails",
        json={
            "title": "Cucumber Cooler",
            "ingredients": [{"name": "Gin", "quantity": "50", "unit": "ml"}],
            "steps": [{"text": "Stir."}],
            "gins": [{"gin_id": gin["id"]}],
        },
    ).json()
    api.post(
        f"/api/v1/admin/cocktails/{recipe['id']}/publish",
        json={"version": recipe["version"], "status": "published"},
    )

    page = client.get(f"{GINS}/{gin['slug']}").json()
    assert page["rating"] == "8.0" and page["review_count"] == 2
    assert {r["title"] for r in page["reviews"]} == {"Lovely", "Fine"}
    assert [c["title"] for c in page["cocktails"]] == ["Cucumber Cooler"]
    assert page["image"]["alt"] == "Bottle" and len(page["images"]) == 1
    # Related: shares botanicals; the private twin and the unrelated sloe gin are left out.
    assert [r["slug"] for r in page["related"]] == [cousin["slug"]]

    # The photo now counts as "in use" and can't be deleted.
    assert "Gin: Hendrick's Gin" in api.get(f"/api/v1/admin/media/{photo['id']}").json()["used_by"]
    assert api.delete(f"/api/v1/admin/media/{photo['id']}").status_code == 409


def test_gin_images_are_ordered_and_validated(api):
    a = upload(api, jpeg_with_gps(), alt="A").json()
    b = upload(api, jpeg_with_gps(), alt="B").json()
    gin = make_gin(api, image_ids=[b["id"], a["id"]])
    assert [i["alt"] for i in gin["images"]] == ["B", "A"]
    r = api.patch(f"{ADMIN_GINS}/{gin['id']}", json={"version": 1, "image_ids": [a["id"], a["id"]]})
    assert r.json()["error"]["code"] == "duplicate_image"
    r = api.patch(f"{ADMIN_GINS}/{gin['id']}", json={"version": 1, "image_ids": [a["id"]]})
    assert [i["alt"] for i in r.json()["images"]] == ["A"]


def test_distilleries_only_with_public_gins(api, client):
    shown = api.post(
        "/api/v1/admin/distilleries", json={"name": "Shown", "website": "https://shown.example"}
    ).json()
    hidden = api.post("/api/v1/admin/distilleries", json={"name": "Hidden"}).json()
    make_gin(api, public_visible=True, distillery_id=shown["id"])
    make_gin(api, brand="Private", public_visible=False, distillery_id=hidden["id"])

    listing = client.get("/api/v1/public/distilleries").json()
    assert [(d["name"], d["gin_count"]) for d in listing] == [("Shown", 1)]
    detail = client.get(f"/api/v1/public/distilleries/{shown['slug']}").json()
    assert detail["website"] == "https://shown.example"
    assert len(detail["gins"]) == 1
    assert client.get(f"/api/v1/public/distilleries/{hidden['slug']}").status_code == 404


def test_stats_count_public_things_only(api, client):
    gin = make_gin(api, public_visible=True, country="Sweden")
    make_gin(api, brand="Private", public_visible=False, country="Norway")
    api.post("/api/v1/admin/bottles", json={"gin_id": gin["id"], "size_ml": 700, "quantity": 5})
    publish_review(api, gin, "8")
    assert client.get("/api/v1/public/stats").json() == {
        "gins": 1,
        "reviews": 1,
        "cocktails": 0,
        "countries": 1,
    }
