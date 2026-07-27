from datetime import datetime
from ingest.parsers.base import ParsedListing


def to_lead_row(
    item: ParsedListing, org_id: str, area_id: str | None, captured_at: datetime
) -> dict:
    """Map a parsed listing onto sourcing_leads columns."""
    return {
        "org_id": org_id,
        "portal": item["portal"],
        "external_id": item["external_id"],
        "url": item["url"],
        "title": item.get("title"),
        "description": item.get("description"),
        "price": item.get("price"),
        "area_sqm_gross": item.get("area_sqm_gross"),
        "typology": item.get("typology"),
        "area_id": area_id,
        "raw_location_text": item.get("raw_location_text"),
        "image_urls": item.get("image_urls") or [],
        "first_seen_at": captured_at,
        "last_seen_at": captured_at,
    }
