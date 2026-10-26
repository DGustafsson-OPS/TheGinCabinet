"""Tonics: a simple catalogue with per-admin reviews, and the public pages."""

from tests.conftest import make_admin, sign_in
from tests.test_editorial import jpeg_with_gps, upload

ADMIN = "/api/v1/admin/tonics"
PUBLIC = "/api/v1/public/tonics"


def make_tonic(api, **overrides) -> dict:
    payload = {
        "brand": "Fever-Tree",
        "name": "Indian Tonic",
        "style": "indian",
        "country": "England",
        "flavour_notes": ["Quinine", "citrus", "quinine "],
        "public_visible": True,
        **overrides,
    }
    r = api.post(ADMIN, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def add_review(api, tonic, **fields) -> dict:
    r = api.post(f"{ADMIN}/{tonic['id']}/reviews", json=fields)
    assert r.status_code == 201, r.text
    return r.json()


def publish(api, review) -> dict:
    return api.patch(
        f"/api/v1/admin/tonic-reviews/{review['id']}",
        json={"version": review["version"], "status": "published"},
    )


def test_create_tonic(api):
    tonic = make_tonic(api)
    assert tonic["slug"] == "fever-tree-indian-tonic"
    assert tonic["display_name"] == "Fever-Tree Indian Tonic"
    assert tonic["flavour_notes"] == ["quinine", "citrus"]  # cleaned and de-duplicated
    assert tonic["reviews"] == []
    # No stock fields at all: tonics are deliberately simple.
    assert not {"bottles_in_cabinet", "bottles_total"} & tonic.keys()


def test_duplicate_names_are_refused(api):
    make_tonic(api)
    r = api.post(ADMIN, json={"brand": "fever-tree", "name": "INDIAN TONIC"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "duplicate_tonic"


def test_edit_with_version_check(api):
    tonic = make_tonic(api)
    r = api.patch(f"{ADMIN}/{tonic['id']}", json={"version": tonic["version"], "country": "UK"})
    assert r.json()["country"] == "UK"
    stale = api.patch(f"{ADMIN}/{tonic['id']}", json={"version": tonic["version"], "country": "X"})
    assert stale.status_code == 409


def test_review_workflow(api):
    tonic = make_tonic(api)
    review = add_review(api, tonic, rating="8.5")
    assert review["status"] == "draft"
    assert review["author"]["display_name"] == "Anna"

    # Publishing needs a rating and notes.
    r = publish(api, review)
    assert r.status_code == 422
    assert r.json()["error"]["details"] == ["Write your tasting notes."]

    r = api.patch(
        f"/api/v1/admin/tonic-reviews/{review['id']}",
        json={
            "version": review["version"],
            "notes": "Crisp and bitter.",
            "pairs_with": "London dry gins",
        },
    )
    live = publish(api, r.json()).json()
    assert live["status"] == "published" and live["published_at"]

    # A published review can't be emptied.
    r = api.patch(
        f"/api/v1/admin/tonic-reviews/{review['id']}",
        json={"version": live["version"], "notes": ""},
    )
    assert r.status_code == 422


def test_public_pages_show_only_public_tonics_and_published_reviews(api, db, client):
    tonic = make_tonic(api)
    make_tonic(api, brand="Secret", name="Tonic", public_visible=False)
    add_review(api, tonic, rating="5", notes="Not finished")  # stays a draft
    published = add_review(api, tonic, rating="9", notes="Superb.", pairs_with="Citrus gins")
    publish(api, published)
    # The other admin reviews it too.
    other = make_admin(db, username="bertil", email="bertil@example.com")
    api.post("/api/v1/auth/logout")
    client.headers["X-CSRF-Token"] = sign_in(client, other)
    second = add_review(client, tonic, rating="8", notes="Very good.")
    publish(client, second)

    listing = client.get(PUBLIC).json()
    assert [t["display_name"] for t in listing["items"]] == ["Fever-Tree Indian Tonic"]
    card = listing["items"][0]
    assert card["rating"] == "8.5" and card["review_count"] == 2  # average of 9 and 8
    assert client.get(f"{PUBLIC}/secret-tonic").status_code == 404

    page = client.get(f"{PUBLIC}/{tonic['slug']}").json()
    assert sorted(r["author_name"] for r in page["reviews"]) == ["Anna", "Bertil"]
    assert "Not finished" not in str(page)  # the draft stays private
    assert "version" not in page and "public_visible" not in page


def test_public_search_filter_and_sort(api):
    a = make_tonic(api, brand="Alpha", name="Light", style="light")
    b = make_tonic(api, brand="Beta", name="Herbal", style="mediterranean")
    publish(api, add_review(api, a, rating="6", notes="Fine."))
    publish(api, add_review(api, b, rating="9", notes="Lovely."))
    names = lambda q: [t["brand"] for t in api.get(f"{PUBLIC}{q}").json()["items"]]  # noqa: E731
    assert names("") == ["Alpha", "Beta"]
    assert names("?sort=rating") == ["Beta", "Alpha"]
    assert names("?style=light") == ["Alpha"]
    assert names("?search=herb") == ["Beta"]


def test_photo_and_delete(api):
    photo = upload(api, jpeg_with_gps(), alt="A tonic bottle").json()
    tonic = make_tonic(api, image_media_id=photo["id"])
    assert tonic["image"]["id"] == photo["id"]
    # The photo counts as "in use" in the media library.
    assert api.delete(f"/api/v1/admin/media/{photo['id']}").status_code == 409
    add_review(api, tonic, rating="7", notes="Ok.")
    assert api.delete(f"{ADMIN}/{tonic['id']}").status_code == 204
    assert api.get(f"{ADMIN}/{tonic['id']}").status_code == 404


def test_admin_routes_need_sign_in(client):
    assert client.get(ADMIN).status_code == 401


# ---------------- Gin reviews that link to a tonic ----------------


def test_gin_review_links_to_a_tonic(api, client):
    from tests.test_catalogue import make_gin
    from tests.test_public_catalogue import publish_review

    tonic = make_tonic(api)
    gin = make_gin(api, public_visible=True)
    review = publish_review(api, gin, rating="8")

    # Link the review to the tonic; the editor sees which tonic it is.
    r = api.patch(
        f"/api/v1/admin/reviews/{review['id']}",
        json={"version": review["version"], "tonic_id": tonic["id"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["linked_tonic"] == {
        "id": tonic["id"],
        "slug": tonic["slug"],
        "display_name": "Fever-Tree Indian Tonic",
        "public_visible": True,
    }

    # Visitors: the review links to the tonic, and the tonic lists the review.
    public_review = client.get(f"/api/v1/public/reviews/{review['slug']}").json()
    assert public_review["tonic_link"] == {
        "slug": tonic["slug"],
        "display_name": "Fever-Tree Indian Tonic",
    }
    page = client.get(f"{PUBLIC}/{tonic['slug']}").json()
    assert [g["slug"] for g in page["gin_reviews"]] == [review["slug"]]


def test_unknown_tonic_is_refused(api):
    from tests.test_catalogue import make_gin

    gin = make_gin(api)
    r = api.post(
        "/api/v1/admin/reviews",
        json={
            "gin_id": gin["id"],
            "title": "T",
            "tonic_id": "00000000-0000-4000-8000-000000000000",
        },
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "unknown_tonic"


def test_private_tonic_is_not_linked_publicly_and_delete_clears_the_link(api, client):
    from tests.test_catalogue import make_gin
    from tests.test_public_catalogue import publish_review

    tonic = make_tonic(api, public_visible=False)
    review = publish_review(api, make_gin(api, public_visible=True), rating="7")
    review = api.patch(
        f"/api/v1/admin/reviews/{review['id']}",
        json={"version": review["version"], "tonic_id": tonic["id"], "tonic": "Our house tonic"},
    ).json()

    # A private tonic has no public page, so the review shows only the text.
    public_review = client.get(f"/api/v1/public/reviews/{review['slug']}").json()
    assert public_review["tonic_link"] is None
    assert public_review["tonic"] == "Our house tonic"

    # Deleting the tonic keeps the review and its text; only the link goes.
    assert api.delete(f"{ADMIN}/{tonic['id']}").status_code == 204
    after = api.get(f"/api/v1/admin/reviews/{review['id']}").json()
    assert after["tonic_id"] is None and after["linked_tonic"] is None
    assert after["tonic"] == "Our house tonic"
