from decimal import Decimal


def load_areas(conn) -> list[dict]:
    """All areas with their aliases. Small table (~100 rows); load once
    per request rather than querying per lead."""
    return conn.execute(
        "SELECT id, name, slug, aliases, municipality FROM areas"
    ).fetchall()


def get_baseline(conn, area_id: str, org_id: str) -> Decimal | None:
    """Effective asking-price baseline for an area.

    An org-specific override wins over the market figure. Otherwise the
    most recent asking baseline is used. Transaction-metric rows are
    never consulted (D4).

    Idealista doesn't publish a price-report page for every freguesia --
    smaller ones get folded into the municipality-level aggregate (see
    HANDOFF.md). If this area has no baseline of its own, fall back to its
    municipality's freguesia=NULL row, which exists for exactly this.
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
    if row:
        return row["price_per_sqm"]

    fallback = conn.execute(
        "SELECT b.price_per_sqm FROM area_price_baselines b "
        "JOIN areas municipality_area ON municipality_area.id = b.area_id "
        "WHERE municipality_area.freguesia IS NULL "
        "AND municipality_area.municipality = "
        "  (SELECT municipality FROM areas WHERE id = %s) "
        "AND municipality_area.id != %s "
        "AND b.metric_type = 'asking' "
        "ORDER BY b.period DESC LIMIT 1",
        (area_id, area_id),
    ).fetchone()
    return fallback["price_per_sqm"] if fallback else None
