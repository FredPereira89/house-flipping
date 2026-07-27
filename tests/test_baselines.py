from datetime import date
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from ingest.parsers.baselines_idealista import parse_baselines

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_baselines_synthetic.html"
URL = "https://www.idealista.pt/estatisticas-imobiliarias/venda-casas/test-baseline-area/"

# Slug deliberately doesn't collide with anything web/prisma/seed.ts would
# ever generate from a real freguesia name in config.json.
TEST_SLUG = "test-baseline-area"


# --- Parser-only tests (no DB, no Flask app) ------------------------------

@pytest.fixture(scope="module")
def html():
    return FIXTURE.read_text(encoding="utf-8")


def test_extracts_price_per_sqm(html):
    price = parse_baselines(URL, html)
    assert price == Decimal("2345.67")


def test_returns_none_when_selector_not_found():
    assert parse_baselines(URL, "<html><body>nothing here</body></html>") is None


def test_returns_none_when_price_tag_has_no_digits():
    html_no_digits = (
        '<div class="price-evolution"><span class="price">n/d</span></div>'
    )
    assert parse_baselines(URL, html_no_digits) is None


def test_strips_currency_and_unit_noise_and_handles_thousands_dot():
    # ',' decimal separator plus a '.' thousands separator plus trailing
    # unit text -- all of it must be stripped except the digits that make
    # up the actual number.
    html_noisy = (
        '<div class="price-evolution"><span class="price">'
        "1.234,00 &euro;/m&sup2;</span></div>"
    )
    assert parse_baselines(URL, html_noisy) == Decimal("1234.00")


def test_KNOWN_FRAGILITY_bare_ascii_digit_in_unit_suffix_corrupts_the_price():
    """Documents a real fragility of the brief's exact regex
    (``re.sub(r"[^\\d,]", "", price_tag.text)``), not a selector-uncertainty
    issue: it strips everything except digits and commas from the WHOLE
    tag text, so any bare ASCII digit anywhere in that text -- not just the
    leading number -- gets appended to the parsed value. A unit suffix
    rendered as literal "m2" (as opposed to the superscript "m&sup2;" used
    in this project's synthetic fixtures) reproduces this: "3.000,00 m2"
    is corrupted into 3000.002 instead of 3000.00. This is implemented
    exactly per the brief (see task-4-report.md) rather than patched with
    an unverified heuristic -- flagging it here so it isn't silently
    rediscovered later."""
    html_bare_unit_digit = (
        '<div class="price-evolution"><span class="price">3.000,00 EUR/m2</span></div>'
    )
    corrupted = parse_baselines(URL, html_bare_unit_digit)
    assert corrupted == Decimal("3000.002")
    assert corrupted != Decimal("3000.00")


# --- Route tests (require a live DATABASE_URL, like tests/test_queue.py) --

@pytest.fixture
def clean_baselines(dsn):
    """area_price_baselines rows cascade-delete when their area is deleted,
    but we still delete both explicitly (belt and suspenders) and scope
    everything to TEST_SLUG so a run never touches the real seeded areas
    table the way tests/conftest.py's clean_leads does for lead tables."""
    yield
    with psycopg.connect(dsn) as c:
        c.execute(
            "DELETE FROM area_price_baselines WHERE area_id IN "
            "(SELECT id FROM areas WHERE slug = %s)",
            (TEST_SLUG,),
        )
        c.execute("DELETE FROM areas WHERE slug = %s", (TEST_SLUG,))
        c.commit()


@pytest.fixture
def test_area(conn):
    area_id = conn.execute(
        """
        INSERT INTO areas (id, name, municipality, slug, aliases, updated_at)
        VALUES (gen_random_uuid()::text, 'Test Baseline Area',
                'Test Municipality', %s, ARRAY[]::text[], now())
        RETURNING id
        """,
        (TEST_SLUG,),
    ).fetchone()["id"]
    # Route writes go through the ingest.db connection pool, a separate
    # connection from this test's `conn` fixture -- it can't see this row
    # unless it's actually committed (same reasoning as test_detail_capture.py).
    conn.commit()
    return area_id


def test_requires_secret(client):
    res = client.post("/ingest/baselines", json={"url": URL, "html": "<html></html>"})
    assert res.status_code == 401


def test_missing_url_or_html_returns_400(client, auth_headers):
    res = client.post("/ingest/baselines", json={"url": URL}, headers=auth_headers)
    assert res.status_code == 400


def test_parse_failure_returns_400_and_writes_nothing(
    client, auth_headers, conn, test_area, clean_baselines
):
    res = client.post(
        "/ingest/baselines",
        json={"url": URL, "html": "<html><body>no price here</body></html>"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert res.get_json()["error"] == "parse failed"

    rows = conn.execute(
        "SELECT count(*) AS n FROM area_price_baselines WHERE area_id = %s",
        (test_area,),
    ).fetchone()
    assert rows["n"] == 0


def test_area_not_found_returns_404_and_writes_nothing_and_does_not_write_to_a_wrong_area(
    client, auth_headers, conn, clean_baselines
):
    """The naive slug match (url.rstrip('/').split('/')[-1] == areas.slug) is
    unverified against real Idealista URLs -- this test locks in the fail-
    safe behaviour the brief promises: an unmatched slug must 404 and must
    NOT silently write against some other/wrong area row, nor fabricate a
    new area."""
    unmatched_url = (
        "https://www.idealista.pt/estatisticas-imobiliarias/venda-casas/"
        "definitely-not-a-real-area-slug/"
    )
    before = conn.execute(
        "SELECT count(*) AS n FROM area_price_baselines"
    ).fetchone()["n"]

    res = client.post(
        "/ingest/baselines",
        json={"url": unmatched_url, "html": FIXTURE.read_text(encoding="utf-8")},
        headers=auth_headers,
    )
    assert res.status_code == 404
    assert res.get_json()["error"] == "area not found"

    after = conn.execute(
        "SELECT count(*) AS n FROM area_price_baselines"
    ).fetchone()["n"]
    assert after == before


def test_successful_ingest_inserts_asking_baseline_row(
    client, auth_headers, conn, test_area, clean_baselines
):
    res = client.post(
        "/ingest/baselines",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8")},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["price_per_sqm"] == "2345.67"

    row = conn.execute(
        "SELECT area_id, source, metric_type, period, price_per_sqm "
        "FROM area_price_baselines WHERE area_id = %s",
        (test_area,),
    ).fetchone()
    assert row is not None
    assert row["source"] == "idealista"
    # D3/D4: asking-price and transaction-price baselines must never blend.
    assert row["metric_type"] == "asking"
    assert row["period"] == date.today().replace(day=1)
    assert row["price_per_sqm"] == Decimal("2345.67")


def test_reingest_same_period_updates_in_place_via_upsert(
    client, auth_headers, conn, test_area, clean_baselines
):
    """A second capture of the same month must update the existing row
    (ON CONFLICT ... DO UPDATE) rather than erroring or duplicating it --
    prices for a given area/source/metric/period are a single fact, not a
    history log."""
    first_html = FIXTURE.read_text(encoding="utf-8")
    res1 = client.post(
        "/ingest/baselines", json={"url": URL, "html": first_html}, headers=auth_headers
    )
    assert res1.status_code == 200

    second_html = (
        '<div class="price-evolution"><span class="price">'
        "3.000,00 &euro;/m&sup2;</span></div>"
    )
    res2 = client.post(
        "/ingest/baselines", json={"url": URL, "html": second_html}, headers=auth_headers
    )
    assert res2.status_code == 200
    assert res2.get_json()["price_per_sqm"] == "3000.00"

    rows = conn.execute(
        "SELECT price_per_sqm FROM area_price_baselines WHERE area_id = %s",
        (test_area,),
    ).fetchall()
    assert len(rows) == 1
    assert rows[0]["price_per_sqm"] == Decimal("3000.00")


def test_parser_exception_returns_400_not_500(
    client, auth_headers, monkeypatch, test_area, clean_baselines
):
    def raising_parse(url, html):
        raise ValueError("simulated unexpected parser crash")

    monkeypatch.setattr(
        "ingest.routes_baselines.baselines_idealista.parse_baselines", raising_parse
    )

    res = client.post(
        "/ingest/baselines",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8")},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "simulated unexpected parser crash" in res.get_json()["error"]


def test_db_error_returns_400_not_500(
    client, auth_headers, conn, test_area, clean_baselines, monkeypatch
):
    import psycopg as psycopg_module

    def broken_connection():
        # Raising here, before `with connection() as conn:` ever gets a
        # context manager to enter, is enough -- no need for this stub to
        # be a working context manager itself.
        raise psycopg_module.OperationalError("simulated DB outage")

    monkeypatch.setattr("ingest.routes_baselines.connection", broken_connection)

    res = client.post(
        "/ingest/baselines",
        json={"url": URL, "html": FIXTURE.read_text(encoding="utf-8")},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "simulated DB outage" in res.get_json()["error"]
