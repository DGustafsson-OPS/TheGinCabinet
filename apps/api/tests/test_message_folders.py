"""The messages inbox: folders, spam (deleted after 90 days) and notes."""

import uuid
from datetime import timedelta

from app.models import ContactMessage, ContactMessageNote
from app.models._types import utcnow
from app.services.maintenance import prune_auth_records

MESSAGES = "/api/v1/admin/messages"


def add_message(db, name: str = "Visitor") -> str:
    """Put a message straight into the inbox (the contact form has its own tests)."""
    message = ContactMessage(
        name=name, email=f"{name.lower()}@example.com", message="Hello!", sender_hash="x" * 64
    )
    db.add(message)
    db.commit()
    return str(message.id)


def names(api, **params) -> list[str]:
    return sorted(m["name"] for m in api.get(MESSAGES, params=params).json()["items"])


def test_folders_move_and_counts(api, db):
    a, b = add_message(db, "Anna"), add_message(db, "Ben")
    r = api.post(f"{MESSAGES}/folders", json={"name": "  Ideas  "})
    assert r.status_code == 201
    ideas = r.json()
    assert ideas["name"] == "Ideas"
    # Names are unique, and "Inbox"/"Spam" are taken by the built-in boxes.
    assert api.post(f"{MESSAGES}/folders", json={"name": "Ideas"}).status_code == 409
    assert api.post(f"{MESSAGES}/folders", json={"name": "spam"}).status_code == 422
    dennis = api.post(f"{MESSAGES}/folders", json={"name": "Dennis"}).json()

    r = api.patch(f"{MESSAGES}/{a}", json={"folder_id": ideas["id"]})
    assert r.json()["folder"] == {"id": ideas["id"], "name": "Ideas"}
    assert names(api, view="inbox") == ["Ben"]
    assert names(api, view="folder", folder_id=ideas["id"]) == ["Anna"]
    assert names(api, view="all") == ["Anna", "Ben"]

    boxes = api.get(f"{MESSAGES}/boxes").json()
    assert (boxes["inbox_count"], boxes["inbox_unread"]) == (1, 1)
    by_name = {f["name"]: f for f in boxes["folders"]}
    assert (by_name["Ideas"]["count"], by_name["Ideas"]["unread"]) == (1, 1)
    assert by_name["Dennis"]["count"] == 0  # empty folders are listed too

    # Rename, then delete: its messages go back to the Inbox.
    r = api.patch(f"{MESSAGES}/folders/{ideas['id']}", json={"name": "Good ideas"})
    assert r.json()["name"] == "Good ideas"
    assert api.delete(f"{MESSAGES}/folders/{ideas['id']}").status_code == 204
    assert names(api, view="inbox") == ["Anna", "Ben"]
    # Back to the Inbox on purpose, too.
    api.patch(f"{MESSAGES}/{b}", json={"folder_id": dennis["id"]})
    api.patch(f"{MESSAGES}/{b}", json={"folder_id": None})
    assert names(api, view="inbox") == ["Anna", "Ben"]


def test_spam_is_hidden_not_counted_and_deleted_after_90_days(api, db):
    spam, keep = add_message(db, "Spammer"), add_message(db, "Friend")
    assert api.get(f"{MESSAGES}/unread-count").json() == {"unread": 2}

    r = api.patch(f"{MESSAGES}/{spam}", json={"spam": True})
    assert r.json()["spam_at"] is not None
    assert names(api, view="all") == ["Friend"]
    assert names(api, view="inbox") == ["Friend"]
    assert names(api, view="spam") == ["Spammer"]
    assert api.get(f"{MESSAGES}/unread-count").json() == {"unread": 1}
    assert api.get(f"{MESSAGES}/boxes").json()["spam_count"] == 1

    # "Not spam" brings it back.
    api.patch(f"{MESSAGES}/{spam}", json={"spam": False})
    assert names(api, view="inbox") == ["Friend", "Spammer"]

    # Marked again; after 90 days the clean-up job deletes it, with its notes.
    api.patch(f"{MESSAGES}/{spam}", json={"spam": True})
    api.post(f"{MESSAGES}/{spam}/notes", json={"text": "Obvious spam."})
    message = db.get(ContactMessage, uuid.UUID(spam))
    message.spam_at = utcnow() - timedelta(days=89)
    db.commit()
    prune_auth_records(db)
    assert names(api, view="spam") == ["Spammer"]  # not yet
    message.spam_at = utcnow() - timedelta(days=91)
    db.commit()
    prune_auth_records(db)
    assert names(api, view="spam") == []
    assert db.query(ContactMessageNote).count() == 0
    assert names(api, view="inbox") == ["Friend"]  # the other one is untouched
    assert keep


def test_notes(api, db):
    message_id = add_message(db)
    r = api.post(
        f"{MESSAGES}/{message_id}/notes", json={"text": "  Replied:\n\nThanks for writing!  "}
    )
    assert r.status_code == 201
    notes = r.json()["notes"]
    assert notes[0]["text"] == "Replied:\n\nThanks for writing!"
    assert notes[0]["author_name"] == "Anna"
    api.post(f"{MESSAGES}/{message_id}/notes", json={"text": "Follow up in May."})
    listed = api.get(MESSAGES).json()["items"][0]["notes"]
    assert [n["text"] for n in listed] == ["Replied:\n\nThanks for writing!", "Follow up in May."]

    assert api.post(f"{MESSAGES}/{message_id}/notes", json={"text": "   "}).status_code == 422
    r = api.delete(f"{MESSAGES}/{message_id}/notes/{notes[0]['id']}")
    assert [n["text"] for n in r.json()["notes"]] == ["Follow up in May."]

    # Deleting the message deletes its notes too.
    assert api.delete(f"{MESSAGES}/{message_id}").status_code == 204
    assert db.query(ContactMessageNote).count() == 0
