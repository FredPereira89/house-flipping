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

DEFAULT_ORG_ID = "default-org"


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
        
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            
            new_count = 0
            updated_count = 0
            
            for row in reader:
                price = Decimal(row["price"]) if row.get("price") else None
                area_val = Decimal(row["area_sqm_gross"]) if row.get("area_sqm_gross") else None
                typology = int(row["typology"]) if row.get("typology") else None
                
                item = {
                    "portal": row["portal"],
                    "external_id": row["external_id"],
                    "url": row["url"],
                    "title": row.get("title"),
                    "description": row.get("description"),
                    "price": price,
                    "area_sqm_gross": area_val,
                    "typology": typology,
                    "raw_location_text": row.get("raw_location_text"),
                    "image_urls": [],
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
