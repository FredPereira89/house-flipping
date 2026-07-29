from decimal import Decimal

from ingest.repositories import areas as areas_repo

TEST_ORG_ID = "default-org"


def _insert_area(conn, *, name, municipality, slug, freguesia=None, aliases=None):
    return conn.execute(
        """
        INSERT INTO areas (id, name, municipality, freguesia, slug, aliases, updated_at)
        VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, now())
        RETURNING id
        """,
        (name, municipality, freguesia, slug, aliases or []),
    ).fetchone()["id"]


def _insert_baseline(conn, area_id, price):
    conn.execute(
        """
        INSERT INTO area_price_baselines
            (id, area_id, source, metric_type, period, price_per_sqm, captured_at, updated_at)
        VALUES (gen_random_uuid()::text, %s, 'idealista', 'asking', now(), %s, now(), now())
        """,
        (area_id, price),
    )


def test_uses_the_areas_own_baseline_when_it_has_one(conn):
    area_id = _insert_area(
        conn, name="Test Freguesia", municipality="Test Municipality",
        slug="test-freguesia-own-baseline", freguesia="Test Freguesia",
    )
    _insert_baseline(conn, area_id, Decimal("2000.00"))

    assert areas_repo.get_baseline(conn, area_id, TEST_ORG_ID) == Decimal("2000.00")


def test_falls_back_to_the_municipality_baseline_when_the_area_has_none(conn):
    # Idealista doesn't publish a page for every freguesia -- the
    # municipality's own freguesia=NULL area is the fallback target.
    municipality_area_id = _insert_area(
        conn, name="Test Municipality (concelho)", municipality="Test Municipality 2",
        slug="test-municipality-2-concelho", freguesia=None,
    )
    _insert_baseline(conn, municipality_area_id, Decimal("1500.00"))

    freguesia_area_id = _insert_area(
        conn, name="Test Small Freguesia", municipality="Test Municipality 2",
        slug="test-small-freguesia", freguesia="Test Small Freguesia",
    )

    assert areas_repo.get_baseline(conn, freguesia_area_id, TEST_ORG_ID) == Decimal("1500.00")


def test_returns_none_when_neither_the_area_nor_its_municipality_has_data(conn):
    freguesia_area_id = _insert_area(
        conn, name="Test Lonely Freguesia", municipality="Test Municipality 3",
        slug="test-lonely-freguesia", freguesia="Test Lonely Freguesia",
    )

    assert areas_repo.get_baseline(conn, freguesia_area_id, TEST_ORG_ID) is None


def test_a_municipality_row_does_not_fall_back_to_itself(conn):
    municipality_area_id = _insert_area(
        conn, name="Test Municipality 4 (concelho)", municipality="Test Municipality 4",
        slug="test-municipality-4-concelho", freguesia=None,
    )

    assert areas_repo.get_baseline(conn, municipality_area_id, TEST_ORG_ID) is None
