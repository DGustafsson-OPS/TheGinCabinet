"""The Gin Journal (spec §10A): editor, publishing workflow, schedules, public pages."""

from datetime import UTC, datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import LoginAttempt
from app.models._types import as_utc
from app.services.blog import publish_due
from app.services.maintenance import run_jobs
from tests.test_catalogue import make_gin
from tests.test_editorial import jpeg_with_gps, upload

ADMIN = "/api/v1/admin/blog"
PUBLIC = "/api/v1/public/blog"

BODY = [
    {"type": "heading", "level": 2, "text": "Arriving in Kyoto"},
    {"type": "paragraph", "text": "We met the [distiller](https://example.com/ki-no-bi) at dawn."},
    {"type": "list", "ordered": False, "items": ["Yuzu", "Gyokuro tea"]},
    {"type": "quote", "text": "Juniper is the soul of gin.", "cite": "The distiller"},
]


def create(api, **overrides) -> dict:
    payload = {
        "title": "A morning in Kyoto",
        "excerpt": "We visited the distillery behind Ki No Bi.",
        "body_blocks": BODY,
        "tags": ["Japan", "distillery visit"],
        **overrides,
    }
    r = api.post(ADMIN, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def act(api, post: dict, action: str, **extra):
    return api.post(f"{ADMIN}/{post['id']}/{action}", json={"version": post["version"], **extra})


def publish(api, post: dict) -> dict:
    r = act(api, post, "publish")
    assert r.status_code == 200, r.text
    return r.json()


def future(minutes: int = 60) -> str:
    return (datetime.now(UTC) + timedelta(minutes=minutes)).isoformat()


# ---------------- Editor ----------------


def test_create_post_as_draft(api):
    post = create(api, tags=["Japan", "japan", " Distillery  Visit "])
    assert post["status"] == "draft"
    assert post["is_live"] is False
    assert post["slug"] == "a-morning-in-kyoto"
    assert post["author"]["display_name"] == "Anna"
    assert post["edited_by"]["display_name"] == "Anna"
    assert post["tags"] == ["Distillery Visit", "Japan"]  # "Japan"/"japan" are one tag
    assert post["reading_minutes"] == 1
    assert post["body_blocks"][0] == {"type": "heading", "level": 2, "text": "Arriving in Kyoto"}

    revisions = api.get(f"{ADMIN}/{post['id']}/revisions").json()
    assert [r["note"] for r in revisions] == ["Created"]

    # The same title again gets a different slug.
    assert create(api)["slug"] == "a-morning-in-kyoto-2"


@pytest.mark.parametrize(
    "block",
    [
        {"type": "paragraph", "text": "Click [here](javascript:alert(1))"},
        {"type": "paragraph", "text": "Bad [link](data:text/html,hi)"},
        {"type": "paragraph", "text": "Hi", "html": "<script>alert(1)</script>"},
        {"type": "html", "text": "<b>bold</b>"},
        {"type": "heading", "level": 1, "text": "Only one H1 per page"},
        {"type": "list", "items": []},
    ],
)
def test_unsafe_or_invalid_blocks_are_rejected(api, block):
    r = api.post(ADMIN, json={"title": "Bad", "body_blocks": [block]})
    assert r.status_code == 422, r.text


def test_site_links_and_https_links_are_allowed(api):
    blocks = [
        {"type": "paragraph", "text": "See [our gins](/collection) and [this](http://a.example)"}
    ]
    assert api.post(ADMIN, json={"title": "Links", "body_blocks": blocks}).status_code == 201


def test_references_must_exist(api):
    r = api.post(
        ADMIN,
        json={
            "title": "Ghost",
            "relations": [{"kind": "gin", "id": "00000000-0000-0000-0000-000000000000"}],
        },
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "unknown_reference"
    r = api.post(
        ADMIN,
        json={
            "title": "Ghost image",
            "body_blocks": [{"type": "image", "media_id": "00000000-0000-0000-0000-000000000000"}],
        },
    )
    assert r.json()["error"]["code"] == "unknown_media"


def test_edit_conflict_and_autosave_rules(api):
    post = create(api)
    r = api.patch(f"{ADMIN}/{post['id']}", json={"version": post["version"], "title": "Kyoto"})
    assert r.status_code == 200
    edited = r.json()

    # A second editor still holding the old version gets a 409 with a diff.
    r = api.patch(f"{ADMIN}/{post['id']}", json={"version": post["version"], "title": "Osaka"})
    assert r.status_code == 409
    assert r.json()["error"]["details"]["current"]["title"] == "Kyoto"

    # Autosave never forces over someone else's save.
    r = api.patch(
        f"{ADMIN}/{post['id']}?force=true",
        json={"version": post["version"], "title": "Osaka", "autosave": True},
    )
    assert r.status_code == 409

    # Autosave of the current version works on a draft...
    r = api.patch(
        f"{ADMIN}/{post['id']}",
        json={"version": edited["version"], "excerpt": "Saved by itself", "autosave": True},
    )
    assert r.status_code == 200
    saved = r.json()
    notes = [rev["note"] for rev in api.get(f"{ADMIN}/{post['id']}/revisions").json()]
    assert notes == ["Autosaved", "Edited", "Created"]

    # ...but never on a published article: that would change what is live.
    live = publish(api, saved)
    r = api.patch(
        f"{ADMIN}/{post['id']}",
        json={"version": live["version"], "title": "Sneaky", "autosave": True},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "autosave_not_draft"
    assert api.get(f"{PUBLIC}/{live['slug']}").json()["title"] == "Kyoto"


# ---------------- Publishing ----------------


def test_publish_needs_body_summary_and_alt_text(api):
    image = upload(api, jpeg_with_gps()).json()  # no alt text yet
    post = create(
        api,
        excerpt=None,
        body_blocks=[{"type": "image", "media_id": image["id"], "caption": "Still"}],
        hero_media_id=image["id"],
    )
    r = act(api, post, "publish")
    assert r.status_code == 422
    problems = r.json()["error"]["details"]
    assert any("summary" in p for p in problems)
    assert any("featured image" in p for p in problems)
    assert any("alt text" in p and "photo.jpg" in p for p in problems)

    api.patch(
        f"/api/v1/admin/media/{image['id']}",
        json={"version": image["version"], "alt": "A copper still"},
    )
    r = api.patch(f"{ADMIN}/{post['id']}", json={"version": post["version"], "excerpt": "Stills."})
    live = publish(api, r.json())
    assert live["status"] == "published" and live["is_live"] is True
    assert live["published_at"] is not None


def test_status_transitions(api):
    post = create(api)
    archived = act(api, post, "archive").json()
    assert archived["status"] == "archived"
    r = act(api, archived, "publish")  # archived -> published isn't allowed
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_transition"
    draft = act(api, archived, "unpublish").json()  # restore to draft
    assert draft["status"] == "draft"
    live = publish(api, draft)
    first_date = live["published_at"]
    offline = act(api, live, "unpublish").json()
    assert offline["status"] == "draft" and offline["is_live"] is False
    assert api.get(f"{PUBLIC}/{post['slug']}").status_code == 404
    again = publish(api, offline)
    assert again["published_at"] == first_date  # keeps its original date

    notes = [r["note"] for r in api.get(f"{ADMIN}/{post['id']}/revisions").json()]
    assert notes[:3] == ["Published", "Unpublished", "Published"]


def test_schedule_and_the_publishing_job(api):
    post = create(api)
    r = act(
        api, post, "schedule", scheduled_at=(datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "schedule_in_past"
    r = act(api, post, "schedule", scheduled_at="2030-01-01T09:00:00")  # no time zone
    assert r.status_code == 422

    when = future(30)
    scheduled = act(api, post, "schedule", scheduled_at=when).json()
    assert scheduled["status"] == "scheduled"
    assert scheduled["is_live"] is False  # "scheduled" is not live
    assert api.get(f"{PUBLIC}/{post['slug']}").status_code == 404

    with SessionLocal() as db:
        assert publish_due(db) == 0  # not yet
        later = datetime.now(UTC) + timedelta(hours=1)
        assert publish_due(db, now=later) == 1
        assert publish_due(db, now=later) == 0  # idempotent: nothing left to do

    live = api.get(f"{ADMIN}/{post['id']}").json()
    assert live["status"] == "published" and live["scheduled_at"] is None
    # The article is dated at the planned time, not when the job ran.
    published_at = datetime.fromisoformat(live["published_at"])
    assert as_utc(published_at) == datetime.fromisoformat(when)
    revisions = api.get(f"{ADMIN}/{post['id']}/revisions").json()
    assert revisions[0]["note"] == "Published on schedule"
    assert revisions[0]["actor_id"] is None
    audit = api.get("/api/v1/admin/audit?action=blog.publish_scheduled").json()
    assert audit["meta"]["total"] == 1


def test_scheduled_post_that_became_invalid_goes_back_to_draft(api):
    post = create(api)
    scheduled = act(api, post, "schedule", scheduled_at=future()).json()
    # Editing a scheduled post is allowed; here someone empties the summary.
    api.patch(f"{ADMIN}/{post['id']}", json={"version": scheduled["version"], "excerpt": ""})
    with SessionLocal() as db:
        assert publish_due(db, now=datetime.now(UTC) + timedelta(days=1)) == 0
    after = api.get(f"{ADMIN}/{post['id']}").json()
    assert after["status"] == "draft"
    note = api.get(f"{ADMIN}/{post['id']}/revisions").json()[0]["note"]
    assert note.startswith("Scheduled publication failed")


def test_cancel_a_schedule(api):
    scheduled = act(api, create(api), "schedule", scheduled_at=future()).json()
    draft = act(api, scheduled, "unpublish").json()
    assert draft["status"] == "draft" and draft["scheduled_at"] is None


def test_bulk_archive_skips_changed_articles(api):
    a, b = create(api, title="One"), create(api, title="Two")
    api.patch(f"{ADMIN}/{b['id']}", json={"version": b["version"], "title": "Two (edited)"})
    r = api.post(
        f"{ADMIN}/bulk-archive",
        json={
            "items": [
                {"id": a["id"], "version": a["version"]},
                {"id": b["id"], "version": b["version"]},
            ]
        },
    )
    assert r.json() == {"archived": 1, "skipped": ["Two (edited)"]}
    assert api.get(f"{ADMIN}?status=archived").json()["meta"]["total"] == 1


def test_duplicate(api):
    gin = make_gin(api, public_visible=True)
    source = publish(api, create(api, relations=[{"kind": "gin", "id": gin["id"]}]))
    r = api.post(f"{ADMIN}/{source['id']}/duplicate")
    assert r.status_code == 201
    copy = r.json()
    assert copy["title"] == "Copy of A morning in Kyoto"
    assert copy["status"] == "draft" and copy["published_at"] is None
    assert copy["tags"] == source["tags"]
    assert copy["body_blocks"] == source["body_blocks"]
    assert [rel["id"] for rel in copy["relations"]] == [gin["id"]]


def test_admin_list_filters(api):
    create(api, title="Gin and tonic guide")
    live = publish(api, create(api, title="Kyoto"))
    assert api.get(f"{ADMIN}?search=tonic").json()["meta"]["total"] == 1
    assert [p["id"] for p in api.get(f"{ADMIN}?status=published").json()["items"]] == [live["id"]]


# ---------------- Categories ----------------


def test_categories(api):
    r = api.post(f"{ADMIN}/categories", json={"name": "Distillery Visits"})
    assert r.status_code == 201
    category = r.json()
    assert category["slug"] == "distillery-visits"
    r = api.post(f"{ADMIN}/categories", json={"name": "Other", "slug": "distillery-visits"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "slug_taken"

    post = create(api, category_id=category["id"])
    assert post["category"]["name"] == "Distillery Visits"
    assert api.delete(f"{ADMIN}/categories/{category['id']}").status_code == 409

    # Public counts include only live articles.
    assert api.get(f"{PUBLIC}/categories").json()[0]["post_count"] == 0
    publish(api, post)
    assert api.get(f"{PUBLIC}/categories").json()[0]["post_count"] == 1

    r = api.patch(
        f"{ADMIN}/categories/{category['id']}",
        json={"version": category["version"], "description": "Trips to stills."},
    )
    assert r.json()["description"] == "Trips to stills."
    assert r.json()["post_count"] == 1


# ---------------- Public ----------------


def test_public_site_shows_only_live_articles_and_public_items(api):
    public_gin = make_gin(api, public_visible=True)
    private_gin = make_gin(api, brand="Secret", name="Gin", public_visible=False)
    body = [
        *BODY,
        {"type": "card", "kind": "gin", "id": public_gin["id"]},
        {"type": "card", "kind": "gin", "id": private_gin["id"]},
    ]
    post = create(
        api,
        body_blocks=body,
        relations=[
            {"kind": "gin", "id": public_gin["id"]},
            {"kind": "gin", "id": private_gin["id"]},
        ],
    )
    draft = create(api, title="Unfinished thoughts", tags=["secret-tag"])

    # The editor sees which linked items are private.
    assert [(r["label"], r["public"]) for r in post["relations"]] == [
        ("Hendrick's Gin", True),
        ("Secret Gin", False),
    ]
    # Nothing is public yet; the preview works for admins.
    assert api.get(PUBLIC).json()["meta"]["total"] == 0
    assert api.get(f"{PUBLIC}/{post['slug']}").status_code == 404
    preview = api.get(f"{ADMIN}/{post['id']}/preview").json()
    assert preview["published_at"] is None

    publish(api, post)
    listing = api.get(PUBLIC).json()
    assert [p["slug"] for p in listing["items"]] == [post["slug"]]
    assert api.get(f"{PUBLIC}/{draft['slug']}").status_code == 404

    page = api.get(f"{PUBLIC}/{post['slug']}").json()
    cards = [b for b in page["body"] if b["type"] == "card"]
    assert [c["card"]["slug"] for c in cards] == [public_gin["slug"]]  # private one dropped
    assert [g["slug"] for g in page["gins"]] == [public_gin["slug"]]
    assert page["author_name"] == "Anna"
    text = str(page)
    assert "anna@example.com" not in text and "Secret" not in text
    assert "version" not in page and "status" not in page

    # Tags: a tag used only by drafts stays hidden.
    assert api.get(f"{PUBLIC}/tags/japan").json()["post_count"] == 1
    assert api.get(f"{PUBLIC}/tags/secret-tag").status_code == 404
    assert api.get(f"{PUBLIC}?tag=japan").json()["meta"]["total"] == 1
    assert api.get(f"{PUBLIC}?search=kyoto").json()["meta"]["total"] == 1
    assert api.get(f"{PUBLIC}?featured=true").json()["meta"]["total"] == 0


def test_related_stories(api):
    category = api.post(f"{ADMIN}/categories", json={"name": "Guides"}).json()
    first = publish(api, create(api, title="First", category_id=category["id"]))
    publish(api, create(api, title="Unrelated"))
    third = publish(api, create(api, title="Third", category_id=category["id"]))
    page = api.get(f"{PUBLIC}/{third['slug']}").json()
    # Same category first, then the newest of the rest.
    assert [p["slug"] for p in page["related"]] == [first["slug"], "unrelated"]


def test_media_used_by_an_article_cannot_be_deleted(api):
    image = upload(api, jpeg_with_gps(), alt="Copper still").json()
    create(api, body_blocks=[{"type": "image", "media_id": image["id"]}])
    r = api.delete(f"/api/v1/admin/media/{image['id']}")
    assert r.status_code == 409
    assert r.json()["error"]["details"]["used_by"] == ["Article: A morning in Kyoto"]


def test_run_jobs_prunes_old_login_attempts(api):
    with SessionLocal() as db:
        db.add(LoginAttempt(username="x", attempted_at=datetime.now(UTC) - timedelta(days=2)))
        db.add(LoginAttempt(username="y"))
        db.commit()
        run_jobs(db)
        names = sorted(a.username for a in db.query(LoginAttempt))
    assert "x" not in names and "y" in names
