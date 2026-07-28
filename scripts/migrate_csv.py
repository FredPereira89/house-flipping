import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from ingest.config import Config
from ingest.normalize import to_lead_row
from ingest.repositories import areas as areas_repo
from ingest.repositories import leads as leads_repo
from ingest.evaluate import price_per_sqm, discount_pct, is_hot_lead
from ingest.area_matcher import match_area
from ingest.disqualify import check as disqualify_check, load_keywords
from ingest.parsers.idealista import ID_RE as IDEALISTA_ID_RE
from ingest.parsers.imovirtual import ID_RE as IMOVIRTUAL_ID_RE
from ingest.parsers.olx import ID_RE as OLX_ID_RE

DEFAULT_ORG_ID = "default-org"

# Same per-portal ID patterns the live parsers use to derive `external_id`
# from a listing URL, so CSV-migrated rows dedupe against live ingestion on
# the (portal, external_id) natural key instead of inventing a new scheme.
PORTAL_ID_PATTERNS = {
    "idealista": IDEALISTA_ID_RE,
    "imovirtual": IMOVIRTUAL_ID_RE,
    "olx": OLX_ID_RE,
}


def external_id_from_link(portal: str, link: str) -> str | None:
    pattern = PORTAL_ID_PATTERNS.get(portal)
    if not pattern or not link:
        return None
    match = pattern.search(link)
    return match.group(1) if match else None


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate legacy CSV leads")
    parser.add_argument("csv_file", help="Path to the legacy CSV file")
    return parser.parse_args()


def migrate(csv_path: str):
    config = Config.from_env()
    if not config.database_url:
        print("DATABASE_URL is not set.")
        sys.exit(1)

    captured_at = datetime.now(timezone.utc)
    
    with psycopg.connect(config.database_url) as conn:
        conn.row_factory = dict_row
        
        settings = conn.execute(
            "SELECT discount_threshold_pct FROM settings WHERE org_id = %s",
            (DEFAULT_ORG_ID,),
        ).fetchone()
        if not settings:
            print("Settings not found for default org.")
            sys.exit(1)
        
        threshold = settings["discount_threshold_pct"]
        all_areas = areas_repo.load_areas(conn)
        keywords = load_keywords(conn, DEFAULT_ORG_ID)
        
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            
            new_count = 0
            updated_count = 0
            
            for row in reader:
                price = Decimal(row["price"]) if row.get("price") and row["price"] != "N/A" else None
                area_val = Decimal(row["area_m2"]) if row.get("area_m2") and row["area_m2"] != "N/A" else None
                typology_str = row.get("typology", "").strip().upper()
                if typology_str.startswith("T"):
                    typology_str = typology_str[1:]
                typology = int(typology_str) if typology_str.isdigit() else None
                
                portal = row["portal"].lower() if row.get("portal") else "idealista"
                link = row.get("link")
                
                external_id = external_id_from_link(portal, link)
                if not external_id:
                    continue
                
                item = {
                    "portal": portal,
                    "external_id": external_id,
                    "url": link,
                    "title": None,
                    "description": row.get("description"),
                    "price": price,
                    "area_sqm_gross": area_val,
                    "typology": typology,
                    "raw_location_text": row.get("location"),
                    "image_urls": [row["image_url"]] if row.get("image_url") else [],
                }
                
                text = " ".join(filter(None, [
                    item.get("raw_location_text"), item.get("title"),
                ]))
                area_id = match_area(text, all_areas)
                db_row = to_lead_row(item, DEFAULT_ORG_ID, area_id, captured_at)
                
                lead_id, inserted, previous_price = leads_repo.upsert_lead(conn, db_row)
                
                if inserted:
                    new_count += 1
                else:
                    updated_count += 1
                
                if price is not None and (inserted or previous_price != price):
                    leads_repo.record_price(conn, lead_id, price, captured_at)
                
                disqualified, category, matched = disqualify_check(
                    db_row["description"], keywords,
                )
                reason = f"{category}:{matched}" if disqualified else None
                
                ppsqm = price_per_sqm(price, db_row["area_sqm_gross"])
                baseline = (
                    areas_repo.get_baseline(conn, area_id, DEFAULT_ORG_ID)
                    if area_id else None
                )
                discount = discount_pct(ppsqm, baseline)
                
                if disqualified:
                    status = "rejected"
                elif is_hot_lead(discount, threshold):
                    status = "hot_lead"
                else:
                    status = "evaluating"
                
                leads_repo.apply_evaluation(
                    conn, lead_id, ppsqm, discount, status, reason,
                )
        
        conn.commit()
        print(f"Migration complete: {new_count} new leads, {updated_count} updated.")

if __name__ == "__main__":
    args = parse_args()
    migrate(args.csv_file)
