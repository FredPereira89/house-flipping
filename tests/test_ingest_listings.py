from pathlib import Path
import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_search.html"
URL = "https://www.idealista.pt/comprar-casas/lisboa/"


@pytest.fixture
def payload():
    return {
        "url": URL,
        "html": FIXTURE.read_text(encoding="utf-8"),
        "captured_at": "2026-07-27T12:00:00Z",
    }


def test_requires_secret(client, payload):
    res = client.post("/ingest/listings", json=payload)
    assert res.status_code == 401


def test_ingests_listings(client, auth_headers, payload, clean_leads, conn):
    res = client.post("/ingest/listings", json=payload, headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["parsed"] > 0
    assert body["new"] == body["parsed"]

    count = conn.execute("SELECT count(*) AS n FROM sourcing_leads").fetchone()
    assert count["n"] == body["new"]


def test_is_idempotent_on_repost(client, auth_headers, payload, clean_leads, conn):
    first = client.post("/ingest/listings", json=payload, headers=auth_headers).get_json()
    second = client.post("/ingest/listings", json=payload, headers=auth_headers).get_json()

    assert second["new"] == 0
    assert second["updated"] == first["new"]

    rows = conn.execute("SELECT count(*) AS n FROM sourcing_leads").fetchone()
    assert rows["n"] == first["new"]

    # Unchanged price must not create a second price-history row.
    hist = conn.execute("SELECT count(*) AS n FROM lead_price_history").fetchone()
    assert hist["n"] == first["new"]


def test_records_a_capture_run(client, auth_headers, payload, clean_leads, conn):
    client.post("/ingest/listings", json=payload, headers=auth_headers)
    run = conn.execute(
        "SELECT url, status, items_parsed FROM capture_runs ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    assert run["url"] == URL
    assert run["status"] == "ok"
    assert run["items_parsed"] > 0


def test_empty_parse_raises_parser_health_alert(client, auth_headers, clean_leads, conn):
    res = client.post(
        "/ingest/listings",
        json={"url": URL, "html": "<html><body>nothing here</body></html>",
              "captured_at": "2026-07-27T12:00:00Z"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.get_json()["status"] == "parse_empty"

    alert = conn.execute(
        "SELECT type, severity FROM alerts WHERE type = 'parser_health' LIMIT 1"
    ).fetchone()
    assert alert is not None
    assert alert["severity"] == "warning"


def test_unknown_portal_is_rejected(client, auth_headers):
    res = client.post(
        "/ingest/listings",
        json={"url": "https://example.com/x", "html": "<html></html>",
              "captured_at": "2026-07-27T12:00:00Z"},
        headers=auth_headers,
    )
    assert res.status_code == 400
