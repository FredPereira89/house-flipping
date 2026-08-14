import os
import pytest
import psycopg
from psycopg.rows import dict_row
from urllib.parse import urlparse

TEST_ORG_ID = "default-org"

# This project has no separate test database by default, so a stray
# `pytest tests/` with DATABASE_URL still pointed at the live dev DB
# silently wipes every real lead via `clean_leads` below (see HANDOFF.md
# §6/§4d/§4f/§4g -- this happened FOUR separate times across this
# project's history, "be more careful next time" demonstrably does not
# work as a fix). `docker compose up -d test-db` brings up a disposable
# `houseflip_test` database on port 5433 specifically for this. This
# check makes pointing at anything else a hard, loud failure instead of a
# silent data-loss bug: it does not matter how careful any future person
# (or agent) running this suite intends to be, the suite itself refuses.
def _assert_is_test_database(url: str) -> None:
    dbname = urlparse(url).path.lstrip("/")
    if dbname != "houseflip_test":
        pytest.fail(
            f"DATABASE_URL points at database '{dbname}', not 'houseflip_test'. "
            "Tests (via the clean_leads fixture) DELETE real rows from "
            "sourcing_leads/capture_queue/saved_searches/etc. Run "
            "`docker compose up -d test-db` and point DATABASE_URL at "
            "postgresql://houseflip:houseflip_dev@localhost:5433/houseflip_test "
            "-- never at the dev DB on port 5432.",
            pytrace=False,
        )


@pytest.fixture(scope="session")
def dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set")
    _assert_is_test_database(url)
    return url


@pytest.fixture
def conn(dsn):
    """A connection wrapped in a transaction that is always rolled back,
    so tests never leave rows behind."""
    with psycopg.connect(dsn) as c:
        c.row_factory = dict_row
        yield c
        c.rollback()


@pytest.fixture
def clean_leads(dsn):
    yield
    with psycopg.connect(dsn) as c:
        c.execute("DELETE FROM lead_price_history")
        c.execute("DELETE FROM lead_tags")
        c.execute("DELETE FROM sourcing_leads")
        c.execute("DELETE FROM capture_runs")
        c.execute("DELETE FROM alerts")
        c.execute("DELETE FROM capture_queue")
        c.execute("DELETE FROM saved_searches")
        c.commit()


@pytest.fixture
def app(monkeypatch, dsn):
    monkeypatch.setenv("INGEST_SHARED_SECRET", "test-secret")
    monkeypatch.setenv("DATABASE_URL", dsn)
    from ingest.app import create_app
    return create_app()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers():
    return {"X-Ingest-Secret": "test-secret"}
