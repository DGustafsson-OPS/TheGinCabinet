"""Media library, tastings and reviews (spec §5 A05, A06, A09, §6, §9, §11)."""

import io

import pytest
from PIL import Image

from app.config import get_settings
from tests.conftest import make_admin, sign_in
from tests.test_catalogue import make_gin

MEDIA = "/api/v1/admin/media"
TASTINGS = "/api/v1/admin/tastings"
REVIEWS = "/api/v1/admin/reviews"
PUBLIC = "/api/v1/public/reviews"

GPS_TAG = 34853  # the EXIF tag number where phones store latitude/longitude


def jpeg_with_gps(width: int = 64, height: int = 48) -> bytes:
    """A small JPEG carrying GPS coordinates, like a phone photo."""
    image = Image.new("RGB", (width, height), (199, 164, 107))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    exif[GPS_TAG] = {1: "N", 2: (59.0, 19.0, 0.0), 3: "E", 4: (18.0, 4.0, 0.0)}
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def upload(api, data: bytes, name: str = "photo.jpg", **form):
    return api.post(MEDIA, files={"file": (name, data, "image/jpeg")}, data=form)


# ---------------- Media ----------------


def test_upload_strips_gps_and_renames(api):
    raw = jpeg_with_gps()
    assert GPS_TAG in Image.open(io.BytesIO(raw)).getexif()  # the test photo really has GPS

    r = upload(api, raw, name="../../holiday.jpg", alt="A bottle of gin")
    assert r.status_code == 201, r.text
    asset = r.json()
    assert asset["mime"] == "image/jpeg"
    assert (asset["width"], asset["height"]) == (64, 48)
    assert asset["alt"] == "A bottle of gin"
    assert "holiday" not in asset["url"] and ".." not in asset["url"]  # random file name

    served = api.get(asset["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert "immutable" in served.headers["cache-control"]
    stored = Image.open(io.BytesIO(served.content))
    assert len(stored.getexif()) == 0  # no EXIF at all: GPS and camera details are gone


@pytest.mark.parametrize(
    ("data", "name", "code"),
    [
        (b"definitely not an image", "fake.jpg", "not_an_image"),
        (
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "x.svg",
            "not_an_image",
        ),
    ],
)
def test_upload_rejects_non_images(api, data, name, code):
    r = upload(api, data, name=name)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == code


def test_upload_rejects_other_image_types(api):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="GIF")
    r = upload(api, buffer.getvalue(), name="anim.gif")
    assert r.json()["error"]["code"] == "unsupported_image_type"


def test_large_images_are_scaled_down(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_image_side", 32)
    r = upload(api, jpeg_with_gps(200, 100))
    assert (r.json()["width"], r.json()["height"]) == (32, 16)


def test_too_big_files_are_refused(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    r = upload(api, jpeg_with_gps())
    assert r.status_code == 413


def test_file_names_cannot_escape_the_media_folder(api):
    assert api.get("/api/v1/media/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert api.get("/api/v1/media/notarandomname.jpg").status_code == 404


def test_media_alt_text_and_delete_protection(api):
    asset = upload(api, jpeg_with_gps()).json()
    r = api.patch(f"{MEDIA}/{asset['id']}", json={"version": 1, "alt": "Juniper berries"})
    assert r.json()["alt"] == "Juniper berries"

    gin = make_gin(api)
    review = api.post(
        REVIEWS, json={"gin_id": gin["id"], "title": "Review", "cover_media_id": asset["id"]}
    ).json()
    assert api.get(f"{MEDIA}/{asset['id']}").json()["used_by"] == ["Review: Review"]

    blocked = api.delete(f"{MEDIA}/{asset['id']}")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "media_in_use"

    api.patch(
        f"{REVIEWS}/{review['id']}", json={"version": review["version"], "cover_media_id": None}
    )
    assert api.delete(f"{MEDIA}/{asset['id']}").status_code == 204
    assert api.get(asset["url"]).status_code == 404  # soft-deleted files are no longer served
    assert api.get(MEDIA).json()["meta"]["total"] == 0


def test_media_needs_login(client):
    assert client.post(MEDIA, files={"file": ("a.jpg", b"x", "image/jpeg")}).status_code == 401


# ---------------- Tastings ----------------


def test_tasting_belongs_to_its_author(api, client, db):
    gin = make_gin(api)
    r = api.post(
        TASTINGS,
        json={
            "gin_id": gin["id"],
            "tasted_on": "2026-10-20",
            "nose": "Pine and lemon",
            "flavours": {"juniper": 5, "citrus": 3},
            "rating": "8.5",
        },
    )
    assert r.status_code == 201, r.text
    tasting = r.json()
    assert tasting["author"]["display_name"] == "Anna"
    assert tasting["rating"] == "8.5"
    assert tasting["flavours"] == {"juniper": 5, "citrus": 3}

    # Anna edits her own tasting...
    ok = api.patch(f"{TASTINGS}/{tasting['id']}", json={"version": 1, "palate": "Oily, warm"})
    assert ok.json()["palate"] == "Oily, warm"

    # ...but Bertil can only read it.
    api.post("/api/v1/auth/logout")
    api.headers.pop("X-CSRF-Token")
    bertil = make_admin(db, username="bertil", email="bertil@example.com")
    api.headers["X-CSRF-Token"] = sign_in(api, bertil)
    assert api.get(f"{TASTINGS}/{tasting['id']}").status_code == 200
    denied = api.patch(f"{TASTINGS}/{tasting['id']}", json={"version": 2, "palate": "Mine now"})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "not_author"


@pytest.mark.parametrize("flavours", [{"juniper": 6}, {"juniper": -1}, {"bubblegum": 2}])
def test_tasting_flavour_scores_are_checked(api, flavours):
    gin = make_gin(api)
    r = api.post(
        TASTINGS, json={"gin_id": gin["id"], "tasted_on": "2026-10-20", "flavours": flavours}
    )
    assert r.status_code == 422


def test_tasting_bottle_must_be_the_same_gin(api):
    gin = make_gin(api)
    other = make_gin(api, brand="Other")
    bottle = api.post("/api/v1/admin/bottles", json={"gin_id": other["id"], "size_ml": 700}).json()[
        0
    ]
    r = api.post(
        TASTINGS, json={"gin_id": gin["id"], "tasted_on": "2026-10-20", "bottle_id": bottle["id"]}
    )
    assert r.json()["error"]["code"] == "bottle_gin_mismatch"


# ---------------- Reviews ----------------


def new_review(api, gin, **extra) -> dict:
    r = api.post(REVIEWS, json={"gin_id": gin["id"], "title": "A Scottish classic", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def set_status(api, review: dict, status: str):
    return api.post(
        f"{REVIEWS}/{review['id']}/status", json={"version": review["version"], "status": status}
    )


def test_review_workflow_and_public_visibility(api, client):
    """Spec §6 "Publish review" and §11 visibility tests, end to end."""
    gin = make_gin(api)
    review = new_review(api, gin, intro="Cucumber and rose. " * 20)
    assert review["status"] == "draft"
    assert review["slug"] == "hendricks-gin-review"

    # Drafts are invisible to the public: a plain 404 (spec §11).
    assert client.get(f"{PUBLIC}/{review['slug']}").status_code == 404

    # You can't skip "ready".
    r = set_status(api, review, "published")
    assert r.json()["error"]["code"] == "invalid_transition"

    review = set_status(api, review, "ready").json()
    r = set_status(api, review, "published")
    assert r.status_code == 422
    problems = r.json()["error"]["details"]
    assert any("gin public" in p for p in problems)
    assert any("verdict" in p for p in problems)
    assert any("rating" in p for p in problems)

    # Fix everything, then publish.
    api.patch(f"/api/v1/admin/gins/{gin['id']}", json={"version": 1, "public_visible": True})
    review = api.patch(
        f"{REVIEWS}/{review['id']}",
        json={"version": review["version"], "verdict": "Buy it.", "rating": "8.5"},
    ).json()
    published = api.post(
        f"{REVIEWS}/{review['id']}/publish",
        json={"version": review["version"], "status": "published"},
    )
    assert published.status_code == 200, published.text
    review = published.json()
    assert review["status"] == "published"
    assert review["published_at"] is not None

    # Now the public can see it, without private fields.
    listing = client.get(PUBLIC).json()
    assert [card["slug"] for card in listing["items"]] == [review["slug"]]
    card = listing["items"][0]
    assert card["author_name"] == "Anna"
    assert card["rating"] == "8.5"
    assert card["teaser"].endswith("…") and len(card["teaser"]) <= 221
    page = client.get(f"{PUBLIC}/{review['slug']}").json()
    assert page["verdict"] == "Buy it."
    for private in ("author_id", "tasting_id", "status", "version", "email", "id"):
        assert private not in page

    # Withdrawing removes it from the list and the page again (spec §11).
    review = set_status(api, review, "draft").json()
    assert client.get(PUBLIC).json()["meta"]["total"] == 0
    assert client.get(f"{PUBLIC}/{review['slug']}").status_code == 404

    # Every step left a revision.
    notes = [rev["note"] for rev in api.get(f"{REVIEWS}/{review['id']}/revisions").json()]
    assert notes == ["Withdrawn to draft", "Published", "Edited", "Marked ready", "Created"]


def test_hiding_the_gin_hides_its_reviews(api, client):
    gin = make_gin(api, public_visible=True)
    review = new_review(api, gin, verdict="Yes", rating="7")
    review = set_status(api, review, "ready").json()
    set_status(api, review, "published")
    assert client.get(PUBLIC).json()["meta"]["total"] == 1

    api.patch(f"/api/v1/admin/gins/{gin['id']}", json={"version": 1, "public_visible": False})
    assert client.get(PUBLIC).json()["meta"]["total"] == 0  # no leak of a private gin


def test_cover_image_needs_alt_text_to_publish(api):
    gin = make_gin(api, public_visible=True)
    image = upload(api, jpeg_with_gps()).json()  # uploaded without alt text
    review = new_review(api, gin, verdict="Yes", rating="7", cover_media_id=image["id"])
    review = set_status(api, review, "ready").json()
    r = set_status(api, review, "published")
    assert any("alt text" in p for p in r.json()["error"]["details"])

    api.patch(f"{MEDIA}/{image['id']}", json={"version": 1, "decorative": True})
    assert set_status(api, review, "published").status_code == 200


def test_public_reviews_sort_by_rating(api, client):
    for brand, rating in [("Alpha", "6"), ("Beta", "9.5"), ("Gamma", "8")]:
        gin = make_gin(api, brand=brand, public_visible=True)
        review = new_review(api, gin, verdict="Fine", rating=rating)
        review = set_status(api, review, "ready").json()
        set_status(api, review, "published")
    ratings = [c["rating"] for c in client.get(PUBLIC, params={"sort": "rating"}).json()["items"]]
    assert ratings == ["9.5", "8.0", "6.0"]


def test_review_edit_conflict(api):
    gin = make_gin(api)
    review = new_review(api, gin)
    api.patch(f"{REVIEWS}/{review['id']}", json={"version": 1, "title": "First"})
    r = api.patch(f"{REVIEWS}/{review['id']}", json={"version": 1, "title": "Second"})
    assert r.status_code == 409
    assert r.json()["error"]["details"]["diff"]["title"] == {"yours": "Second", "current": "First"}
