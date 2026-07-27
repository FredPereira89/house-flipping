import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS

from ingest.auth import require_secret
from ingest.config import Config
from ingest.db import connection
from ingest.disqualify import check as disqualify_check, load_keywords
from ingest.evaluate import price_per_sqm, discount_pct, is_hot_lead
from ingest.health import ping_deadman
from ingest.normalize import to_lead_row
from ingest.parsers import get_parser
from ingest.repositories import areas as areas_repo
from ingest.repositories import captures as captures_repo
from ingest.repositories import leads as leads_repo

logger = logging.getLogger("ingest.app")

DEFAULT_ORG_ID = "default-org"


def _parse_captured_at(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def create_app() -> Flask:
    logging.basicConfig(level=logging.INFO)
    app = Flask(__name__)
    CORS(app)
    config = Config.from_env()
    
    from ingest.routes_queue import bp as queue_bp
    app.register_blueprint(queue_bp)

    from ingest.routes_detail import bp as detail_bp
    app.register_blueprint(detail_bp)

    from ingest.routes_baselines import bp as baselines_bp
    app.register_blueprint(baselines_bp)

    @app.post("/ingest/listings")
    @require_secret
    def ingest_listings():
        body = request.get_json(silent=True) or {}
        url = body.get("url")
        html = body.get("html")
        if not url or not html:
            return jsonify({"error": "url and html are required"}), 400

        parser = get_parser(url)
        if parser is None:
            return jsonify({"error": "unsupported portal"}), 400

        captured_at = _parse_captured_at(body.get("captured_at"))
        items = parser(url, html)
        org_id = DEFAULT_ORG_ID

        if not items:
            with connection() as conn:
                captures_repo.record_run(
                    conn, org_id, None, url, len(html), 0, 0,
                    "parse_empty", None, captured_at,
                )
                captures_repo.raise_alert(
                    conn, org_id, "parser_health", "warning",
                    f"Parsed 0 listings from {url}",
                )
                conn.commit()
            logger.warning("Parsed 0 listings from %s", url)
            return jsonify({
                "parsed": 0, "new": 0, "updated": 0,
                "hot_leads": 0, "status": "parse_empty",
            })

        new_count = updated_count = hot_count = 0

        with connection() as conn:
            settings = conn.execute(
                "SELECT discount_threshold_pct FROM settings WHERE org_id = %s",
                (org_id,),
            ).fetchone()
            threshold = settings["discount_threshold_pct"]
            all_areas = areas_repo.load_areas(conn)
            keywords = load_keywords(conn, org_id)

            from ingest.area_matcher import match_area

            for item in items:
                text = " ".join(filter(None, [
                    item.get("raw_location_text"), item.get("title"),
                ]))
                area_id = match_area(text, all_areas)
                row = to_lead_row(item, org_id, area_id, captured_at)

                lead_id, inserted, previous_price = leads_repo.upsert_lead(conn, row)
                if inserted:
                    new_count += 1
                else:
                    updated_count += 1

                price = row["price"]
                if price is not None and (inserted or previous_price != price):
                    leads_repo.record_price(conn, lead_id, price, captured_at)

                disqualified, category, matched = disqualify_check(
                    row["description"], keywords,
                )
                reason = f"{category}:{matched}" if disqualified else None

                ppsqm = price_per_sqm(price, row["area_sqm_gross"])
                baseline = (
                    areas_repo.get_baseline(conn, area_id, org_id)
                    if area_id else None
                )
                discount = discount_pct(ppsqm, baseline)

                if disqualified:
                    status = "rejected"
                elif is_hot_lead(discount, threshold):
                    status = "hot_lead"
                    hot_count += 1
                    captures_repo.raise_alert(
                        conn, org_id, "hot_lead", "high",
                        f"{discount}% below area baseline: {row['url']}",
                        "sourcing_lead", lead_id,
                    )
                else:
                    status = "evaluating"

                leads_repo.apply_evaluation(
                    conn, lead_id, ppsqm, discount, status, reason,
                )

            captures_repo.record_run(
                conn, org_id, items[0]["portal"], url, len(html),
                len(items), new_count, "ok", None, captured_at,
            )
            conn.commit()

        ping_deadman(config)
        return jsonify({
            "parsed": len(items), "new": new_count, "updated": updated_count,
            "hot_leads": hot_count, "status": "ok",
        })

    return app


if __name__ == "__main__":
    cfg = Config.from_env()
    create_app().run(port=cfg.port)
