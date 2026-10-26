"""Proof of cookie consent and the admin statistics."""

from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import ConsentRecord
from app.services.maintenance import run_jobs


def record(client, consent_id="abcdefghijklmnop1234", action="accept_all", analytics=True):
    return client.post(
        "/internal/consent",
        json={
            "consent_id": consent_id,
            "policy_version": 1,
            "action": action,
            "analytics": analytics,
        },
    )


def test_record_consent(client):
    assert record(client).status_code == 204
    with SessionLocal() as db:
        row = db.query(ConsentRecord).one()
    assert (row.consent_id, row.action, row.analytics) == (
        "abcdefghijklmnop1234",
        "accept_all",
        True,
    )


def test_bad_records_are_rejected(client):
    assert record(client, consent_id="short").status_code == 422
    assert record(client, consent_id="<script>alert(1)</script>xx").status_code == 422
    assert record(client, action="sell_my_data").status_code == 422


def test_not_reachable_under_the_public_api_path(client):
    # The website forwards only /api/... here, so the record endpoint must not
    # exist under /api: browsers can't write consent records directly.
    assert client.post("/api/v1/internal/consent", json={}).status_code == 404


def test_stats_count_each_browsers_latest_answer(api):
    record(api, "browser-one-aaaaaaaa", "accept_all", True)
    record(api, "browser-one-aaaaaaaa", "reject_all", False)  # changed their mind
    record(api, "browser-two-bbbbbbbb", "custom", True)
    record(api, "browser-three-cccccc", "reject_all", False)
    stats = api.get("/api/v1/admin/consent/stats").json()
    assert stats["total"] == 3
    assert stats["analytics_allowed"] == 1
    assert stats["analytics_refused"] == 2
    assert stats["by_action"] == {"reject_all": 2, "custom": 1}


def test_stats_need_admin(client):
    assert client.get("/api/v1/admin/consent/stats").status_code == 401


def test_old_records_are_pruned(client):
    record(client)
    with SessionLocal() as db:
        db.add(
            ConsentRecord(
                consent_id="ancient-record-xxxxx",
                policy_version=1,
                action="accept_all",
                analytics=True,
                recorded_at=datetime.now(UTC) - timedelta(days=4 * 365),
            )
        )
        db.commit()
        run_jobs(db)
        ids = sorted(r.consent_id for r in db.query(ConsentRecord))
    assert ids == ["abcdefghijklmnop1234"]
