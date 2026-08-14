import os
import shutil
from pathlib import Path

import pytest

from ingest.parsers.detail_idealista import parse_detail

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_detail_synthetic.html"
URL = "https://www.idealista.pt/imovel/12345678/"


# --- Parser-only tests (no DB, no Flask app) ------------------------------

@pytest.fixture(scope="module")
def parsed():
    html = FIXTURE.read_text(encoding="utf-8")
    return parse_detail(URL, html)


def test_extracts_description_from_comment_p(parsed):
    assert "Apartamento T3 remodelado" in parsed["description"]


def test_description_extraction_is_lossless_across_multiple_paragraphs(parsed):
    """Regression test: select_one(".comment p") would only ever return the
    FIRST <p>, silently dropping every paragraph after it. The fixture's
    .comment block has two <p> elements -- both must survive."""
    assert "Apartamento T3 remodelado" in parsed["description"]
    assert "Segundo paragrafo" in parsed["description"]
    assert "totalmente renovado em 2023" in parsed["description"]


def test_prefers_data_src_over_src(parsed):
    assert (
        "https://img4.idealista.pt/blur/WEB_LISTING-M/0/id.pro.pt.image.master/aa/bb/cc/full.jpg"
        in parsed["image_urls"]
    )
    assert (
        "https://img4.idealista.pt/placeholder.jpg" not in parsed["image_urls"]
    )


def test_falls_back_to_src_when_no_data_src(parsed):
    assert (
        "https://img4.idealista.pt/blur/WEB_LISTING-M/0/id.pro.pt.image.master/dd/ee/ff/full.jpg"
        in parsed["image_urls"]
    )


def test_ignores_non_idealista_domains_and_missing_src(parsed):
    assert not any("example.com" in u for u in parsed["image_urls"])
    assert len(parsed["image_urls"]) == 2


def test_ignores_site_chrome_on_the_img4_domain_that_is_not_a_property_photo(parsed):
    """Regression test: the site header's logo and the language-selector's
    flag icons are also <picture><img> elements, also on an idealista.pt
    subdomain -- a bare "idealista.pt" substring check wrongly captured
    them as photo position 0 on every real detail-page capture (confirmed
    live: st3.idealista.pt's own logo SVG, gallery photos starting only at
    position 1). Only img4.idealista.pt's image-CDN path is a real photo."""
    assert not any("logo-default" in u for u in parsed["image_urls"])
    assert not any("/flags/" in u for u in parsed["image_urls"])
    assert len(parsed["image_urls"]) == 2


def test_empty_page_logs_but_does_not_raise(caplog):
    result = parse_detail(URL, "<html><body>nothing here</body></html>")
    assert result == {"description": "", "image_urls": []}


# --- Route tests (require a live DATABASE_URL, like tests/test_queue.py) -

class FakeResponse:
    def __init__(self, status_code=200, content=b"fake-jpg-bytes"):
        self.status_code = status_code
        self.content = content


@pytest.fixture
def photo_cleanup():
    """Photos are written to data/photos/<lead_id> relative to cwd, the same
    way the route itself resolves the path (no dependency injection for the
    base dir exists). Track dirs created during a test and remove them
    afterwards so runs don't accumulate junk under data/."""
    created: list[str] = []
    yield created
    for d in created:
        shutil.rmtree(d, ignore_errors=True)


def _make_lead_and_queue_row(conn, url, external_id="det1"):
    lead_id = conn.execute(
        """
        INSERT INTO sourcing_leads
            (id, org_id, portal, external_id, url, first_seen_at, last_seen_at, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', 'idealista', %s, %s, now(), now(), now())
        RETURNING id
        """,
        (external_id, url),
    ).fetchone()["id"]
    queue_id = conn.execute(
        """
        INSERT INTO capture_queue (id, org_id, url, kind, state, enqueued_at, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', %s, 'detail', 'in_progress', now(), now())
        RETURNING id
        """,
        (url,),
    ).fetchone()["id"]
    return lead_id, queue_id


def test_requires_secret(client):
    res = client.post("/ingest/detail", json={"url": URL, "html": "<html></html>", "job_id": "fake"})
    assert res.status_code == 401


def test_unsupported_portal_is_rejected_and_marks_queue(
    client, auth_headers, conn, clean_leads
):
    other_url = "https://example.com/imovel/1"
    queue_id = conn.execute(
        """
        INSERT INTO capture_queue (id, org_id, url, kind, state, enqueued_at, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', %s, 'detail', 'in_progress', now(), now())
        RETURNING id
        """,
        (other_url,),
    ).fetchone()["id"]
    conn.commit()

    res = client.post(
        "/ingest/detail",
        json={"url": other_url, "html": "<html></html>", "job_id": queue_id},
        headers=auth_headers,
    )
    assert res.status_code == 400

    row = conn.execute(
        "SELECT state, attempts FROM capture_queue WHERE url = %s", (other_url,)
    ).fetchone()
    assert row["attempts"] == 1
    assert row["state"] == "pending"


def test_lead_not_found_marks_queue_pending_for_retry(
    client, auth_headers, conn, clean_leads
):
    missing_url = "https://www.idealista.pt/imovel/99999999/"
    queue_id = conn.execute(
        """
        INSERT INTO capture_queue (id, org_id, url, kind, state, enqueued_at, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', %s, 'detail', 'in_progress', now(), now())
        RETURNING id
        """,
        (missing_url,),
    ).fetchone()["id"]
    conn.commit()

    res = client.post(
        "/ingest/detail",
        json={"url": missing_url, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert res.status_code == 404

    row = conn.execute(
        "SELECT state, attempts, last_error FROM capture_queue WHERE url = %s",
        (missing_url,),
    ).fetchone()
    assert row["state"] == "pending"
    assert row["attempts"] == 1
    assert row["last_error"]


def test_captures_description_and_photos(
    client, auth_headers, conn, clean_leads, monkeypatch, photo_cleanup
):
    lead_id, queue_id = _make_lead_and_queue_row(conn, URL)
    conn.commit()
    photo_cleanup.append(os.path.join("data", "photos", lead_id))

    calls = []

    def fake_get(img_url, timeout=None):
        calls.append((img_url, timeout))
        return FakeResponse(status_code=200)

    monkeypatch.setattr("ingest.routes_detail.requests.get", fake_get)

    res = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["downloaded"] == 2

    # Every image download used the required timeout.
    assert len(calls) == 2
    assert all(timeout == 15 for _, timeout in calls)

    lead = conn.execute(
        "SELECT description FROM sourcing_leads WHERE id = %s", (lead_id,)
    ).fetchone()
    assert "Apartamento T3 remodelado" in lead["description"]

    photos = conn.execute(
        "SELECT source_url, local_path, position FROM lead_photos "
        "WHERE lead_id = %s ORDER BY position",
        (lead_id,),
    ).fetchall()
    assert len(photos) == 2
    assert all(os.path.exists(p["local_path"]) for p in photos)

    queue_row = conn.execute(
        "SELECT state, completed_at FROM capture_queue WHERE url = %s", (URL,)
    ).fetchone()
    assert queue_row["state"] == "done"
    assert queue_row["completed_at"] is not None


def test_failed_download_does_not_block_other_photos_or_queue_completion(
    client, auth_headers, conn, clean_leads, monkeypatch, photo_cleanup
):
    """A single bad image (404 from the CDN) must not sink the whole job --
    it's logged and skipped, the rest of the photos are still recorded, and
    the queue row still reaches 'done'."""
    lead_id, queue_id = _make_lead_and_queue_row(conn, URL)
    conn.commit()
    photo_cleanup.append(os.path.join("data", "photos", lead_id))

    def fake_get(img_url, timeout=None):
        if "aa/bb/cc" in img_url:
            return FakeResponse(status_code=404, content=b"")
        return FakeResponse(status_code=200)

    monkeypatch.setattr("ingest.routes_detail.requests.get", fake_get)

    res = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.get_json()["downloaded"] == 1

    queue_row = conn.execute(
        "SELECT state FROM capture_queue WHERE url = %s", (URL,)
    ).fetchone()
    assert queue_row["state"] == "done"


def test_exception_mid_capture_retries_then_escalates_to_failed(
    client, auth_headers, conn, clean_leads, monkeypatch, photo_cleanup
):
    lead_id, queue_id = _make_lead_and_queue_row(conn, URL)
    conn.commit()
    photo_cleanup.append(os.path.join("data", "photos", lead_id))

    def raising_get(img_url, timeout=None):
        raise ConnectionError("simulated stalled connection")

    monkeypatch.setattr("ingest.routes_detail.requests.get", raising_get)

    # Attempts 1-4: still retried (state left 'pending').
    for expected_attempts in range(1, 5):
        res = client.post(
            "/ingest/detail",
            json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
            headers=auth_headers,
        )
        assert res.status_code == 500
        row = conn.execute(
            "SELECT state, attempts FROM capture_queue WHERE url = %s", (URL,)
        ).fetchone()
        assert row["attempts"] == expected_attempts
        assert row["state"] == "pending"

    # 5th failure hits MAX_ATTEMPTS -- escalate to 'failed' so it stops
    # looping forever.
    res = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert res.status_code == 500
    row = conn.execute(
        "SELECT state, attempts, last_error FROM capture_queue WHERE url = %s",
        (URL,),
    ).fetchone()
    assert row["attempts"] == 5
    assert row["state"] == "failed"
    assert "simulated stalled connection" in row["last_error"]

    # No sourcing_leads/lead_photos writes survived the rolled-back
    # transaction.
    lead = conn.execute(
        "SELECT description FROM sourcing_leads WHERE id = %s", (lead_id,)
    ).fetchone()
    assert lead["description"] is None
    photos = conn.execute(
        "SELECT count(*) AS n FROM lead_photos WHERE lead_id = %s", (lead_id,)
    ).fetchone()
    assert photos["n"] == 0


def test_retry_after_partial_success_does_not_duplicate_photos(
    client, auth_headers, conn, clean_leads, monkeypatch, photo_cleanup
):
    """Regression test for the file-exists-vs-db-recorded gap: if a photo
    was already downloaded and recorded (e.g. from an earlier attempt that
    later failed on a different image), a retry must not re-insert a
    duplicate lead_photos row for it, but must still make forward progress
    on photos that weren't recorded yet."""
    lead_id, queue_id = _make_lead_and_queue_row(conn, URL)
    conn.commit()
    photo_cleanup.append(os.path.join("data", "photos", lead_id))

    calls = []

    def fake_get(img_url, timeout=None):
        calls.append(img_url)
        return FakeResponse(status_code=200)

    monkeypatch.setattr("ingest.routes_detail.requests.get", fake_get)

    first = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert first.get_json()["downloaded"] == 2
    assert len(calls) == 2

    # Re-run the same capture (simulating a retry after the queue row was
    # put back to 'pending' and re-drained).
    calls.clear()
    second = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert second.status_code == 200
    # Files already exist on disk, so no re-download...
    assert calls == []
    # ...and no duplicate rows, since both were already recorded.
    assert second.get_json()["downloaded"] == 0

    photos = conn.execute(
        "SELECT count(*) AS n FROM lead_photos WHERE lead_id = %s", (lead_id,)
    ).fetchone()
    assert photos["n"] == 2


def test_retry_reinserts_a_photo_whose_row_was_rolled_back_but_file_survived(
    client, auth_headers, conn, clean_leads, monkeypatch, photo_cleanup
):
    """Reconstructs the actual failure precondition the file/DB-decoupling
    fix exists for, rather than just two clean successful runs back to back.

    Sequence:
    1. First request: photo 0 downloads fine (its file is written to disk
       and its lead_photos INSERT is issued, uncommitted). Photo 1's
       download then raises, which propagates out of the whole
       `with connection() as conn:` block in routes_detail and rolls back
       the transaction -- including photo 0's INSERT -- before anything
       commits. Photo 0's *file*, however, already made it to disk (file
       I/O isn't transactional), so after this request: file exists,
       DB row does not.
    2. Second request (retry, as the queue's 'pending' state invites):
       both downloads now succeed. Photo 0's file already exists, so it is
       not re-downloaded -- but its row must still be (re-)inserted, since
       `recorded_source_urls` is queried fresh from the DB each call and
       correctly shows it as NOT recorded.

    Against the pre-fix nesting (INSERT gated by the same
    `if not os.path.exists(...)` check as the download, i.e. skipped
    together), step 2 would skip photo 0 entirely -- file exists, so the
    whole block including the INSERT is skipped -- permanently losing its
    DB row even though the file sits right there on disk. This test was
    run against that reverted nesting to confirm it fails there (asserts
    below on `downloaded == 2` / `len(photos) == 2` would instead see 1),
    and passes against the fix in routes_detail.py.
    """
    lead_id, queue_id = _make_lead_and_queue_row(conn, URL)
    conn.commit()
    photo_dir = os.path.join("data", "photos", lead_id)
    photo_cleanup.append(photo_dir)

    call_count = {"n": 0}

    def fail_on_second_image(img_url, timeout=None):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise ConnectionError("simulated stall on the second image")
        return FakeResponse(status_code=200)

    monkeypatch.setattr("ingest.routes_detail.requests.get", fail_on_second_image)

    first = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert first.status_code == 500

    # Photo 0's file made it to disk before the second call raised...
    photo_0_path = os.path.join(photo_dir, "0.jpg")
    assert os.path.exists(photo_0_path)

    # ...but the whole transaction -- including photo 0's INSERT -- rolled
    # back, so nothing is recorded yet.
    photos_after_failure = conn.execute(
        "SELECT count(*) AS n FROM lead_photos WHERE lead_id = %s", (lead_id,)
    ).fetchone()["n"]
    assert photos_after_failure == 0

    # Queue row was bumped back to 'pending' so a drain will retry it.
    row = conn.execute(
        "SELECT state FROM capture_queue WHERE url = %s", (URL,)
    ).fetchone()
    assert row["state"] == "pending"

    # Retry: both images now download cleanly. Photo 0's file already
    # exists on disk from the failed attempt above -- this is the crux of
    # the test.
    monkeypatch.setattr(
        "ingest.routes_detail.requests.get",
        lambda img_url, timeout=None: FakeResponse(status_code=200),
    )
    second = client.post(
        "/ingest/detail",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8"), "job_id": queue_id},
        headers=auth_headers,
    )
    assert second.status_code == 200
    # Both photos must be recorded now -- crucially, photo 0's row must
    # have been (re-)inserted even though its file already existed on disk.
    assert second.get_json()["downloaded"] == 2

    photos = conn.execute(
        "SELECT source_url FROM lead_photos WHERE lead_id = %s", (lead_id,)
    ).fetchall()
    assert len(photos) == 2
