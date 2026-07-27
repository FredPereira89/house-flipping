import json
from decimal import Decimal


def upsert_lead(conn, row: dict) -> tuple[str, bool, Decimal | None]:
    """Insert or update a lead on (org_id, portal, external_id).

    Returns (lead_id, was_inserted, previous_price). The previous price
    lets the caller decide whether to write a price-history row.
    """
    existing = conn.execute(
        "SELECT id, price FROM sourcing_leads "
        "WHERE org_id = %s AND portal = %s AND external_id = %s",
        (row["org_id"], row["portal"], row["external_id"]),
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE sourcing_leads SET "
            "url = %s, title = %s, description = %s, price = %s, "
            "area_sqm_gross = %s, typology = %s, area_id = %s, "
            "raw_location_text = %s, image_urls = %s, "
            "last_seen_at = %s, updated_at = now() "
            "WHERE id = %s",
            (
                row["url"], row["title"], row["description"], row["price"],
                row["area_sqm_gross"], row["typology"], row["area_id"],
                row["raw_location_text"], json.dumps(row["image_urls"]),
                row["last_seen_at"], existing["id"],
            ),
        )
        return existing["id"], False, existing["price"]

    inserted = conn.execute(
        "INSERT INTO sourcing_leads "
        "(id, org_id, portal, external_id, url, title, description, price, "
        " area_sqm_gross, typology, area_id, raw_location_text, image_urls, "
        " first_seen_at, last_seen_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
        "        %s, %s, %s, %s, %s, now(), now()) "
        "RETURNING id",
        (
            row["org_id"], row["portal"], row["external_id"], row["url"],
            row["title"], row["description"], row["price"],
            row["area_sqm_gross"], row["typology"], row["area_id"],
            row["raw_location_text"], json.dumps(row["image_urls"]),
            row["first_seen_at"], row["last_seen_at"],
        ),
    ).fetchone()
    return inserted["id"], True, None


def record_price(conn, lead_id: str, price: Decimal, observed_at) -> None:
    conn.execute(
        "INSERT INTO lead_price_history "
        "(id, lead_id, price, observed_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, now(), now())",
        (lead_id, price, observed_at),
    )


def apply_evaluation(
    conn, lead_id: str, price_per_sqm, discount, status: str,
    disqualify_reason: str | None,
) -> None:
    conn.execute(
        "UPDATE sourcing_leads SET "
        "price_per_sqm_gross = %s, discount_pct = %s, status = %s, "
        "disqualified_at = CASE WHEN %s::text IS NULL THEN NULL ELSE now() END, "
        "disqualify_reason = %s, updated_at = now() "
        "WHERE id = %s",
        (price_per_sqm, discount, status, disqualify_reason,
         disqualify_reason, lead_id),
    )
