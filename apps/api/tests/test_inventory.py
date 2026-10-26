"""Bottles, purchases, wishlist and dashboard (spec §5 A01, A03, A04, A08, §6, §11)."""

from tests.test_catalogue import make_gin

BOTTLES = "/api/v1/admin/bottles"
PURCHASES = "/api/v1/admin/purchases"
WISHLIST = "/api/v1/admin/wishlist"
DASHBOARD = "/api/v1/admin/dashboard"


def buy(api, lines, currency="SEK", **extra) -> dict:
    r = api.post(
        PURCHASES,
        json={
            "purchased_on": "2026-10-01",
            "retailer": "Systembolaget",
            "currency": currency,
            "lines": lines,
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def bottles_of(api, gin_id) -> list[dict]:
    return api.get(BOTTLES, params={"gin_id": gin_id}).json()["items"]


def test_purchase_creates_one_bottle_per_unit(api):
    gin = make_gin(api)
    purchase = buy(
        api,
        [
            {"gin_id": gin["id"], "size_ml": 700, "quantity": 2, "unit_price": "349.00"},
            {"gin_id": gin["id"], "size_ml": 50},  # a gift: no price needed
        ],
        currency="sek",
        shelf="Top shelf",
    )
    assert purchase["currency"] == "SEK"
    assert purchase["total"] == "698.00"
    assert purchase["bottles_without_price"] == 1
    assert purchase["lines"][0]["line_total"] == "698.00"

    bottles = bottles_of(api, gin["id"])
    assert len(bottles) == 3
    assert {b["size_ml"] for b in bottles} == {700, 50}
    assert all(b["status"] == "sealed" and b["shelf"] == "Top shelf" for b in bottles)
    assert len({b["id"] for b in bottles}) == 3  # every bottle has its own id

    gin_now = api.get(f"/api/v1/admin/gins/{gin['id']}").json()
    assert (gin_now["bottles_in_cabinet"], gin_now["bottles_total"]) == (3, 3)


def test_purchase_validation(api):
    gin = make_gin(api)
    line = {"gin_id": gin["id"], "size_ml": 700}
    for bad in [
        {"currency": "kronor", "lines": [line]},
        {"currency": "SEK", "lines": []},
        {"currency": "SEK", "lines": [{**line, "quantity": 0}]},
        {"currency": "SEK", "lines": [{**line, "unit_price": "-1"}]},
    ]:
        r = api.post(PURCHASES, json={"purchased_on": "2026-10-01", "retailer": "X", **bad})
        assert r.status_code == 422, bad


def test_bottle_life_cycle_keeps_history(api):
    """Spec §6 "Consume bottle" and §11 "Opening, finishing ... preserves history"."""
    gin = make_gin(api)
    buy(api, [{"gin_id": gin["id"], "size_ml": 700, "unit_price": "300"}])
    bottle = bottles_of(api, gin["id"])[0]
    url = f"{BOTTLES}/{bottle['id']}"

    r = api.post(f"{url}/status", json={"version": 1, "status": "open", "on": "2026-10-05"})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["remaining_ml"], r.json()["opened_at"]) == (
        "open",
        700,
        "2026-10-05",
    )

    r = api.patch(url, json={"version": r.json()["version"], "remaining_ml": 400})
    assert r.json()["remaining_ml"] == 400

    r = api.post(f"{url}/status", json={"version": r.json()["version"], "status": "empty"})
    assert r.json()["status"] == "empty"
    assert r.json()["remaining_ml"] == 0
    assert r.json()["finished_at"] is not None

    history = [(e["from_status"], e["to_status"], e["remaining_ml"]) for e in r.json()["events"]]
    assert history == [
        (None, "sealed", None),
        ("sealed", "open", 700),
        ("open", "open", 400),
        ("open", "empty", 0),
    ]

    # An empty bottle can't be reopened, and it is no longer "in the cabinet".
    again = api.post(f"{url}/status", json={"version": r.json()["version"], "status": "open"})
    assert again.status_code == 422
    assert again.json()["error"]["code"] == "invalid_transition"
    assert api.get(BOTTLES, params={"in_cabinet": "true"}).json()["meta"]["total"] == 0
    assert api.get(BOTTLES).json()["meta"]["total"] == 1  # but still in the records


def test_level_rules(api):
    gin = make_gin(api)
    sealed = api.post(BOTTLES, json={"gin_id": gin["id"], "size_ml": 500}).json()[0]
    r = api.patch(f"{BOTTLES}/{sealed['id']}", json={"version": 1, "remaining_ml": 100})
    assert r.json()["error"]["code"] == "not_open"

    opened = api.post(
        BOTTLES, json={"gin_id": gin["id"], "size_ml": 500, "status": "open", "remaining_ml": 250}
    ).json()[0]
    assert opened["remaining_ml"] == 250
    r = api.patch(f"{BOTTLES}/{opened['id']}", json={"version": 1, "remaining_ml": 501})
    assert r.json()["error"]["code"] == "remaining_out_of_range"

    r = api.post(BOTTLES, json={"gin_id": gin["id"], "size_ml": 500, "remaining_ml": 600})
    assert r.status_code == 422


def test_one_gin_many_bottles_different_size_price_state(api):
    """Spec §11: a gin can have multiple bottles with different size, price and state."""
    gin = make_gin(api)
    buy(api, [{"gin_id": gin["id"], "size_ml": 700, "unit_price": "349"}])
    buy(api, [{"gin_id": gin["id"], "size_ml": 1000, "unit_price": "29.90"}], currency="EUR")
    big = next(b for b in bottles_of(api, gin["id"]) if b["size_ml"] == 1000)
    api.post(f"{BOTTLES}/{big['id']}/status", json={"version": 1, "status": "open"})

    states = sorted((b["size_ml"], b["status"]) for b in bottles_of(api, gin["id"]))
    assert states == [(700, "sealed"), (1000, "open")]


def test_stale_bottle_status_change_is_409(api):
    gin = make_gin(api)
    bottle = api.post(BOTTLES, json={"gin_id": gin["id"], "size_ml": 700}).json()[0]
    api.patch(f"{BOTTLES}/{bottle['id']}", json={"version": 1, "shelf": "Kitchen"})
    r = api.post(f"{BOTTLES}/{bottle['id']}/status", json={"version": 1, "status": "gifted"})
    assert r.status_code == 409


def test_dashboard_numbers(api):
    """Spec A01: value excludes unknown costs but shows them; per currency."""
    gin = make_gin(api)
    buy(api, [{"gin_id": gin["id"], "size_ml": 700, "quantity": 2, "unit_price": "300"}])
    buy(api, [{"gin_id": gin["id"], "size_ml": 700, "unit_price": "25.50"}], currency="EUR")
    api.post(BOTTLES, json={"gin_id": gin["id"], "size_ml": 700, "source": "gift"})
    # A gifted-away bottle no longer counts.
    gone = buy(api, [{"gin_id": gin["id"], "size_ml": 50, "unit_price": "99"}])
    gone_bottle = next(b for b in bottles_of(api, gin["id"]) if b["size_ml"] == 50)
    api.post(f"{BOTTLES}/{gone_bottle['id']}/status", json={"version": 1, "status": "gifted"})
    assert gone["total"] == "99.00"
    # One bottle is open.
    open_one = next(b for b in bottles_of(api, gin["id"]) if b["source"] == "gift")
    api.post(f"{BOTTLES}/{open_one['id']}/status", json={"version": 1, "status": "open"})

    d = api.get(DASHBOARD).json()
    assert d["unique_gins"] == 1
    assert d["physical_bottles"] == 4
    assert d["open_bottles"] == 1
    assert d["inventory_value"] == [
        {"currency": "EUR", "amount": "25.50", "bottles": 1},
        {"currency": "SEK", "amount": "600.00", "bottles": 2},
    ]
    assert d["bottles_without_cost"] == 1
    assert d["public_gins"] == 0
    assert d["recent_activity"][0]["action"] == "bottle.status"


def test_wishlist_convert_keeps_notes(api):
    gin = make_gin(api)
    item = api.post(
        WISHLIST,
        json={
            "gin_id": gin["id"],
            "priority": 1,
            "target_price": "350",
            "currency": "sek",
            "notes": "Ask for the gift box",
        },
    )
    assert item.status_code == 201, item.text
    item = item.json()
    assert item["text"] == "Hendrick's Gin"  # filled in from the catalogue

    purchase = api.post(
        f"{WISHLIST}/{item['id']}/convert",
        json={
            "version": 1,
            "purchase": {
                "purchased_on": "2026-10-20",
                "retailer": "Duty free",
                "currency": "SEK",
                "lines": [{"gin_id": gin["id"], "size_ml": 1000, "unit_price": "329"}],
            },
        },
    )
    assert purchase.status_code == 201, purchase.text
    assert len(bottles_of(api, gin["id"])) == 1

    bought = api.get(WISHLIST, params={"status": "purchased"}).json()["items"][0]
    assert bought["notes"] == "Ask for the gift box"
    assert bought["purchase_id"] == purchase.json()["id"]
    assert api.get(WISHLIST).json()["meta"]["total"] == 0  # default view: still wanted

    again = api.post(
        f"{WISHLIST}/{item['id']}/convert",
        json={
            "version": bought["version"],
            "purchase": {
                "purchased_on": "2026-10-20",
                "retailer": "X",
                "currency": "SEK",
                "lines": [{"gin_id": gin["id"], "size_ml": 700}],
            },
        },
    )
    assert again.json()["error"]["code"] == "not_wanted"


def test_wishlist_needs_gin_or_text(api):
    assert api.post(WISHLIST, json={"priority": 2}).status_code == 422
    r = api.post(WISHLIST, json={"text": "Something from Ki No Bi", "priority": 2})
    assert r.status_code == 201
    r = api.patch(f"{WISHLIST}/{r.json()['id']}", json={"version": 1, "status": "dropped"})
    assert r.json()["status"] == "dropped"
