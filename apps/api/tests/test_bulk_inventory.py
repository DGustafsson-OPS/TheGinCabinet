"""Bulk actions: make many gins public at once, and save many bottle levels at once."""

from tests.test_catalogue import GINS, make_gin
from tests.test_inventory import BOTTLES

PUBLIC_GINS = "/api/v1/public/gins"


def public_gins(client) -> list[dict]:
    return client.get(PUBLIC_GINS, params={"search": "Bulk"}).json()["items"]


def test_make_many_gins_public_then_private(api, client):
    a = make_gin(api, name="Bulk A", public_visible=False)
    b = make_gin(api, name="Bulk B", public_visible=False)
    c = make_gin(api, name="Bulk C", public_visible=True)  # already public

    r = api.post(
        f"{GINS}/visibility", json={"ids": [a["id"], b["id"], c["id"]], "public_visible": True}
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"changed": 2}  # C was already public
    shown = {g["display_name"].removeprefix("Hendrick's ") for g in public_gins(client)}
    assert shown == {"Bulk A", "Bulk B", "Bulk C"}
    # Each changed gin got a new version, so an open edit form notices.
    assert api.get(f"{GINS}/{a['id']}").json()["version"] == a["version"] + 1

    r = api.post(f"{GINS}/visibility", json={"ids": [a["id"], c["id"]], "public_visible": False})
    assert r.json() == {"changed": 2}
    shown = {g["display_name"].removeprefix("Hendrick's ") for g in public_gins(client)}
    assert shown == {"Bulk B"}


def test_bulk_visibility_rules(api, client):
    gin = make_gin(api)
    unknown = "00000000-0000-0000-0000-000000000000"
    r = api.post(f"{GINS}/visibility", json={"ids": [gin["id"], unknown], "public_visible": True})
    assert r.status_code == 404
    assert api.get(f"{GINS}/{gin['id']}").json()["public_visible"] is False  # nothing changed
    assert (
        api.post(f"{GINS}/visibility", json={"ids": [], "public_visible": True}).status_code == 422
    )


def add(api, gin_id, **extra) -> dict:
    r = api.post(BOTTLES, json={"gin_id": gin_id, "size_ml": 700, **extra})
    assert r.status_code == 201, r.text
    return r.json()[0]


def test_update_levels_open_and_finish_in_one_save(api):
    gin = make_gin(api)
    sealed = add(api, gin["id"])
    opened = add(api, gin["id"], status="open", remaining_ml=500)
    nearly = add(api, gin["id"], status="open", remaining_ml=40)
    untouched = add(api, gin["id"], status="open", remaining_ml=300)

    r = api.post(
        f"{BOTTLES}/levels",
        json={
            "changes": [
                {
                    "id": sealed["id"],
                    "version": sealed["version"],
                    "status": "open",
                    "remaining_ml": 650,
                },
                {"id": opened["id"], "version": opened["version"], "remaining_ml": 350},
                {"id": nearly["id"], "version": nearly["version"], "status": "empty"},
                # Same level as before: not a change.
                {"id": untouched["id"], "version": untouched["version"], "remaining_ml": 300},
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"changed": 3}

    def now(bottle):
        return api.get(f"{BOTTLES}/{bottle['id']}").json()

    assert (now(sealed)["status"], now(sealed)["remaining_ml"]) == ("open", 650)
    assert now(opened)["remaining_ml"] == 350
    assert now(nearly)["status"] == "empty"
    assert now(untouched)["version"] == untouched["version"]
    # The history records each change, like single edits do.
    assert now(opened)["events"][-1]["note"] == "Level updated" or any(
        e["note"] == "Level updated" for e in now(opened)["events"]
    )


def test_update_levels_is_all_or_nothing(api):
    gin = make_gin(api, name="Levels Gin")
    good = add(api, gin["id"], status="open", remaining_ml=500)
    bad = add(api, gin["id"], status="open", remaining_ml=500)

    # Too much in one bottle: nothing is saved, and the error names the bottle.
    r = api.post(
        f"{BOTTLES}/levels",
        json={
            "changes": [
                {"id": good["id"], "version": good["version"], "remaining_ml": 100},
                {"id": bad["id"], "version": bad["version"], "remaining_ml": 900},
            ]
        },
    )
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "remaining_out_of_range"
    assert "Levels Gin" in error["message"] and error["details"]["bottle_id"] == bad["id"]
    assert api.get(f"{BOTTLES}/{good['id']}").json()["remaining_ml"] == 500

    # Open bottles can't be sealed again.
    r = api.post(
        f"{BOTTLES}/levels",
        json={"changes": [{"id": good["id"], "version": good["version"], "status": "sealed"}]},
    )
    assert r.json()["error"]["code"] == "invalid_transition"

    # Someone else saved meanwhile: 409, nothing saved.
    api.patch(f"{BOTTLES}/{good['id']}", json={"version": good["version"], "remaining_ml": 450})
    r = api.post(
        f"{BOTTLES}/levels",
        json={"changes": [{"id": good["id"], "version": good["version"], "remaining_ml": 50}]},
    )
    assert r.status_code == 409
    assert api.get(f"{BOTTLES}/{good['id']}").json()["remaining_ml"] == 450
