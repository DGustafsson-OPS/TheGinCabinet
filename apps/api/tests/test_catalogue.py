"""Distilleries, gins and the two-person edit conflict (spec §5 A02, §6, §11)."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError

from app.db import SessionLocal
from app.models import GinProduct

GINS = "/api/v1/admin/gins"
DISTILLERIES = "/api/v1/admin/distilleries"

HENDRICKS = {
    "brand": "Hendrick's",
    "name": "Gin",
    "style": "distilled",
    "abv": "41.4",
    "country": "Scotland",
    "botanicals": ["Juniper", "cucumber", "rose", "juniper"],
}


def make_gin(api, **overrides) -> dict:
    r = api.post(GINS, json={**HENDRICKS, **overrides})
    assert r.status_code == 201, r.text
    return r.json()


def test_admin_routes_need_login(client):
    assert client.get(GINS).status_code == 401


def test_writes_need_csrf_token(api):
    api.headers.pop("X-CSRF-Token")
    r = api.post(GINS, json=HENDRICKS)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


def test_create_gin_with_distillery_and_botanicals(api):
    distillery = api.post(
        DISTILLERIES, json={"name": "William Grant & Sons", "country": "Scotland"}
    )
    assert distillery.status_code == 201
    assert distillery.json()["slug"] == "william-grant-sons"

    gin = make_gin(api, distillery_id=distillery.json()["id"])
    assert gin["slug"] == "hendricks-gin"
    assert gin["display_name"] == "Hendrick's Gin"
    assert gin["abv"] == "41.40"  # exact decimal, sent as a string
    assert gin["botanicals"] == ["cucumber", "juniper", "rose"]  # cleaned + de-duplicated
    assert gin["distillery"]["name"] == "William Grant & Sons"
    assert gin["public_visible"] is False  # private until explicitly approved
    assert gin["version"] == 1

    r = api.get(f"{DISTILLERIES}/{distillery.json()['id']}")
    assert r.json()["gin_count"] == 1


def test_gin_identity_is_unique_ignoring_case(api):
    make_gin(api)
    r = api.post(GINS, json={**HENDRICKS, "brand": "HENDRICK'S", "name": "gin"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "duplicate_gin"
    # A different edition is a different gin, with its own unique slug.
    orbium = make_gin(api, edition="Orbium")
    assert orbium["slug"] == "hendricks-gin-orbium"


@pytest.mark.parametrize("abv", ["0", "-5", "100.01", "abc"])
def test_abv_must_be_between_0_and_100(api, abv):
    r = api.post(GINS, json={**HENDRICKS, "abv": abv})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["field"] == "abv"


def test_taken_slug_is_refused(api):
    make_gin(api)
    r = api.post(GINS, json={**HENDRICKS, "edition": "Lunar", "slug": "hendricks-gin"})
    assert r.json()["error"]["code"] == "slug_taken"


def test_unknown_distillery_is_404(api):
    r = api.post(GINS, json={**HENDRICKS, "distillery_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 404


def test_search_and_filter(api):
    make_gin(api)
    make_gin(
        api,
        brand="Tanqueray",
        name="London Dry Gin",
        style="london_dry",
        abv="43.1",
        country="England",
        public_visible=True,
        botanicals=[],
    )
    names = lambda r: [g["brand"] for g in r.json()["items"]]  # noqa: E731

    assert names(api.get(GINS, params={"search": "tanq"})) == ["Tanqueray"]
    assert names(api.get(GINS, params={"search": "scotland"})) == ["Hendrick's"]
    assert names(api.get(GINS, params={"public": "true"})) == ["Tanqueray"]
    assert names(api.get(GINS, params={"style": "london_dry"})) == ["Tanqueray"]
    assert names(api.get(GINS, params={"search": "%"})) == []  # wildcard is escaped

    page = api.get(GINS, params={"page_size": 1}).json()
    assert page["meta"] == {"page": 1, "page_size": 1, "total": 2, "pages": 2}


def test_patch_changes_only_sent_fields(api):
    gin = make_gin(api)
    r = api.patch(f"{GINS}/{gin['id']}", json={"version": 1, "public_visible": True})
    assert r.status_code == 200
    body = r.json()
    assert body["public_visible"] is True
    assert body["country"] == "Scotland"  # untouched
    assert body["version"] == 2


def test_botanical_only_change_still_bumps_version(api):
    gin = make_gin(api)
    r = api.patch(f"{GINS}/{gin['id']}", json={"version": 1, "botanicals": ["lime"]})
    assert r.json()["botanicals"] == ["lime"]
    assert r.json()["version"] == 2


def test_stale_edit_returns_409_with_diff(api):
    """Spec §6/§11: concurrent edits give a meaningful 409, not a silent overwrite."""
    gin = make_gin(api)
    url = f"{GINS}/{gin['id']}"
    # "Bertil" saves first...
    assert api.patch(url, json={"version": 1, "country": "UK"}).status_code == 200
    # ...then "Anna" saves her change based on the old version 1.
    r = api.patch(url, json={"version": 1, "country": "Scotland, UK", "abv": "41.4"})
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["code"] == "version_conflict"
    assert error["details"]["current"]["country"] == "UK"
    assert error["details"]["current"]["version"] == 2
    # Only real differences are listed: abv 41.4 == 41.40, so it's not in the diff.
    assert error["details"]["diff"] == {"country": {"yours": "Scotland, UK", "current": "UK"}}

    # Overwriting is possible, but only deliberately.
    forced = api.patch(url, params={"force": "true"}, json={"version": 1, "country": "Scotland"})
    assert forced.status_code == 200
    assert forced.json()["country"] == "Scotland"
    assert forced.json()["version"] == 3


def test_database_blocks_simultaneous_saves(api):
    """Even if two saves pass the version check at the same moment, the database's
    ``WHERE version = ?`` check stops the second one."""
    gin_id = make_gin(api)["id"]
    first, second = SessionLocal(), SessionLocal()
    try:
        gin_a = first.scalar(select(GinProduct).where(GinProduct.slug == "hendricks-gin"))
        gin_b = second.scalar(select(GinProduct).where(GinProduct.slug == "hendricks-gin"))
        gin_a.country = "A"
        first.commit()
        gin_b.country = "B"
        with pytest.raises(StaleDataError):
            second.commit()
    finally:
        first.close()
        second.close()
    assert api.get(f"{GINS}/{gin_id}").json()["country"] == "A"


def test_changes_are_audited(api):
    gin = make_gin(api)
    api.patch(f"{GINS}/{gin['id']}", json={"version": 1, "abv": "42"})
    events = api.get("/api/v1/admin/audit", params={"entity_type": "gin"}).json()["items"]
    assert [e["action"] for e in events] == ["gin.update", "gin.create"]
    assert events[0]["summary"]["fields"] == ["abv"]
    assert events[0]["actor_name"] == "Anna"


def test_admin_gin_shows_review_and_tasting_ratings(api):
    from tests.test_public_catalogue import publish_review

    gin = make_gin(api, public_visible=True)  # a review can only be published for a public gin
    publish_review(api, gin, rating="8", title="Good")
    api.post("/api/v1/admin/reviews", json={"gin_id": gin["id"], "title": "Draft", "rating": "2"})
    for rating in ("6", "7"):
        api.post(
            "/api/v1/admin/tastings",
            json={"gin_id": gin["id"], "tasted_on": "2026-10-20", "rating": rating},
        )

    one = api.get(f"/api/v1/admin/gins/{gin['id']}").json()
    # Only published reviews count for the public figure; drafts don't.
    assert (one["review_rating"], one["review_count"]) == ("8.0", 1)
    assert (one["tasting_rating"], one["tasting_count"]) == ("6.5", 2)
    listed = api.get("/api/v1/admin/gins").json()["items"]
    row = next(g for g in listed if g["id"] == gin["id"])
    assert row["review_rating"] == "8.0" and row["tasting_rating"] == "6.5"

    # A gin without any: no rating, zero counts.
    other = api.get(f"/api/v1/admin/gins/{make_gin(api, name='Other')['id']}").json()
    assert (other["review_rating"], other["review_count"]) == (None, 0)
