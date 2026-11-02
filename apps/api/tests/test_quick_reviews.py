"""Quick reviews: 1–5 juniper berries and a line or two, counted in the gin's rating."""

from tests.conftest import make_admin
from tests.test_catalogue import make_gin
from tests.test_public_catalogue import publish_review

QUICK = "/api/v1/admin/quick-reviews"
PUBLIC = "/api/v1/public/gins"


def quick(api, gin, rating, **fields) -> dict:
    r = api.post(QUICK, json={"gin_id": gin["id"], "rating": rating, **fields})
    assert r.status_code == 201, r.text
    return r.json()


def test_add_edit_and_delete(api):
    gin = make_gin(api, public_visible=True)
    review = quick(api, gin, "4.5", note="  Bright, citrus, very easy.  ")
    assert (review["rating"], review["note"], review["author"]["display_name"]) == (
        "4.5",
        "Bright, citrus, very easy.",
        "Anna",
    )

    # Whole or half berries, from 1 to 5.
    for bad in ("4.3", "0.5", "5.5", "0"):
        r = api.patch(f"{QUICK}/{review['id']}", json={"version": review["version"], "rating": bad})
        assert r.status_code == 422, bad
    r = api.patch(f"{QUICK}/{review['id']}", json={"version": review["version"], "rating": "3"})
    assert r.json()["rating"] == "3.0"
    # Saving from an old copy is a conflict.
    stale = api.patch(f"{QUICK}/{review['id']}", json={"version": review["version"], "rating": "5"})
    assert stale.status_code == 409

    # One quick review per person per gin.
    r = api.post(QUICK, json={"gin_id": gin["id"], "rating": "2"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "duplicate_quick_review"

    assert [q["id"] for q in api.get(QUICK, params={"gin_id": gin["id"]}).json()] == [review["id"]]
    assert api.delete(f"{QUICK}/{review['id']}").status_code == 204
    assert api.get(QUICK, params={"gin_id": gin["id"]}).json() == []


def test_shown_on_the_gin_and_counted_in_its_rating(api, client, db):
    gin = make_gin(api, public_visible=True)
    other = make_gin(api, brand="Other", public_visible=True)
    # A full review of 7/10 and a quick review of 4.5 berries (= 9/10): average 8/10.
    publish_review(api, gin, "7.0")
    bertil = make_admin(db, username="bertil", email="bertil@example.com")
    quick(api, gin, "4.5", note="Lovely with tonic.", author_id=str(bertil.user.id))

    page = client.get(f"{PUBLIC}/{gin['slug']}").json()
    assert page["rating"] == "8.0"
    assert (page["review_count"], page["quick_review_count"]) == (1, 1)
    assert page["quick_reviews"] == [
        {
            "author_name": "Bertil",
            "rating": "4.5",
            "note": "Lovely with tonic.",
            "created_at": page["quick_reviews"][0]["created_at"],
        }
    ]

    # A gin with only quick reviews is rated too, and filters and sorts with the rest.
    quick(api, other, "5")
    cards = client.get(PUBLIC, params={"sort": "rating"}).json()["items"]
    assert [(c["slug"], c["rating"]) for c in cards[:2]] == [
        (other["slug"], "10.0"),
        (gin["slug"], "8.0"),
    ]
    rated_9 = client.get(PUBLIC, params={"min_rating": "9"}).json()["items"]
    assert [c["slug"] for c in rated_9] == [other["slug"]]


def test_private_gins_keep_their_quick_reviews_private(api, client):
    gin = make_gin(api, public_visible=False)
    quick(api, gin, "4")
    assert client.get(f"{PUBLIC}/{gin['slug']}").status_code == 404
    assert gin["slug"] not in [c["slug"] for c in client.get(PUBLIC).json()["items"]]
    # The admin list flags it.
    assert api.get(QUICK).json()[0]["public"] is False


def test_quick_reviews_of_tonics(api, client):
    from tests.test_tonics import make_tonic

    tonic = make_tonic(api)
    gin = make_gin(api, public_visible=True)
    review = api.post(
        QUICK, json={"tonic_id": tonic["id"], "rating": "4", "note": "Crisp and dry."}
    ).json()
    assert (review["tonic"]["slug"], review["gin"], review["public"]) == (tonic["slug"], None, True)

    # A gin or a tonic, not both and not neither; one per person per tonic.
    both = {"gin_id": gin["id"], "tonic_id": tonic["id"], "rating": "3"}
    assert api.post(QUICK, json=both).status_code == 422
    assert api.post(QUICK, json={"rating": "3"}).status_code == 422
    assert api.post(QUICK, json={"tonic_id": tonic["id"], "rating": "2"}).status_code == 409
    # Rating the gin is separate.
    assert api.post(QUICK, json={"gin_id": gin["id"], "rating": "2"}).status_code == 201

    # The tonic page shows it and counts it (4 bottles = 8/10); the gin's rating
    # is untouched by it.
    page = client.get(f"/api/v1/public/tonics/{tonic['slug']}").json()
    assert (page["rating"], page["quick_review_count"]) == ("8.0", 1)
    assert page["quick_reviews"][0]["note"] == "Crisp and dry."
    assert client.get(f"{PUBLIC}/{gin['slug']}").json()["rating"] == "4.0"
    assert [q["id"] for q in api.get(QUICK, params={"tonic_id": tonic["id"]}).json()] == [
        review["id"]
    ]

    # Deleting the tonic deletes its quick reviews.
    assert api.delete(f"/api/v1/admin/tonics/{tonic['id']}").status_code == 204
    assert api.get(QUICK, params={"tonic_id": tonic["id"]}).json() == []
