from decimal import Decimal


def load_areas(conn) -> list[dict]:
    """All areas with their aliases. Small table (~100 rows); load once
    per request rather than querying per lead."""
    return conn.execute(
        "SELECT id, name, slug, aliases FROM areas"
    ).fetchall()


def get_baseline(conn, area_id: str, org_id: str) -> Decimal | None:
    """Effective asking-price baseline for an area.

    An org-specific override wins over the market figure. Otherwise the
    most recent asking baseline is used. Transaction-metric rows are
    never consulted (D4).
    """
    override = conn.execute(
        "SELECT price_per_sqm FROM org_area_overrides "
        "WHERE org_id = %s AND area_id = %s",
        (org_id, area_id),
    ).fetchone()
    if override:
        return override["price_per_sqm"]

    row = conn.execute(
        "SELECT price_per_sqm FROM area_price_baselines "
        "WHERE area_id = %s AND metric_type = 'asking' "
        "ORDER BY period DESC LIMIT 1",
        (area_id,),
    ).fetchone()
    return row["price_per_sqm"] if row else None
