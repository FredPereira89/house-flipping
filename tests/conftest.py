import os
import pytest
import psycopg
from psycopg.rows import dict_row

TEST_ORG_ID = "default-org"


@pytest.fixture(scope="session")
def dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set")
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
