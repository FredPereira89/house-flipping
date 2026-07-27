import os
import psycopg
import pytest


def test_database_reachable_with_extensions():
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn) as conn:
        rows = conn.execute(
            "SELECT extname FROM pg_extension ORDER BY extname"
        ).fetchall()
    names = {r[0] for r in rows}
    assert "pg_trgm" in names
    assert "unaccent" in names
