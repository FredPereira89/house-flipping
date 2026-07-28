import logging
from datetime import date

from flask import Blueprint, jsonify, request

from ingest.auth import require_secret
from ingest.db import connection
from ingest.parsers import baselines_idealista
from ingest.parsers.baselines_idealista import NO_DATA_SENTINEL
from ingest.repositories import queue as queue_repo

logger = logging.getLogger("ingest.routes_baselines")

bp = Blueprint("baselines", __name__)

# A baseline URL that 404s or otherwise fails is a permanent property of
# that URL (unlike a detail-page anti-bot block, which is transient and
# worth routes_detail.py's 5 retries) -- one retry is enough to rule out a
# one-off network blip before the queue stops coming back to it.
MAX_ATTEMPTS = 1


@bp.route("/ingest/baselines", methods=["POST"])
@require_secret
def ingest_baselines():
    body = request.get_json(silent=True) or {}
    url = body.get("url")
    html = body.get("html")
    job_id = body.get("job_id")
    if not url or not html:
        return jsonify({"error": "url and html are required"}), 400

    def _fail(msg, status):
        if job_id:
            with connection() as conn:
                queue_repo.retry_or_fail(conn, job_id, msg, MAX_ATTEMPTS)
                conn.commit()
        return jsonify({"error": msg}), status

    try:
        price_per_sqm = baselines_idealista.parse_baselines(url, html)
    except Exception as exc:  # noqa: BLE001 -- a malformed/unexpected page
        # must come back as a clean 400, never a raw 500 traceback (this
        # endpoint has no capture_queue row to retry against, unlike
        # routes_detail's _fail(), so there's nothing to escalate -- just
        # report the bad input).
        logger.exception("Unhandled error parsing baselines page %s", url)
        return _fail(str(exc), 400)

    if price_per_sqm is None:
        return _fail("parse failed", 400)

    if price_per_sqm == NO_DATA_SENTINEL:
        # Idealista showed "N/A" for this freguesia.
        # It's a successful capture (the page loaded and we parsed it),
        # but there is no data to insert.
        if job_id:
            with connection() as conn:
                queue_repo.mark_done(conn, job_id)
                conn.commit()
        return jsonify({"status": "success", "price_per_sqm": "N/A"})

    parts = url.split("relatorios-preco-habitacao/")
    if len(parts) < 2:
        return _fail("unrecognized url format", 400)
        
    idealista_url = parts[1]
    if not idealista_url.endswith('/'):
        idealista_url += '/'

    try:
        with connection() as conn:
            row = conn.execute(
                "SELECT id FROM areas WHERE idealista_url = %s", (idealista_url,)
            ).fetchone()
            if not row:
                return _fail("area not found", 404)

            conn.execute(
                """
                INSERT INTO area_price_baselines
                (id, area_id, source, metric_type, period, price_per_sqm,
                 captured_at, created_at, updated_at)
                VALUES (gen_random_uuid()::text, %s, 'idealista', 'asking',
                        %s, %s, now(), now(), now())
                ON CONFLICT (area_id, source, metric_type, period)
                DO UPDATE SET price_per_sqm = EXCLUDED.price_per_sqm,
                              captured_at = now(), updated_at = now()
                """,
                (row["id"], date.today().replace(day=1), price_per_sqm),
            )
            if job_id:
                queue_repo.mark_done(conn, job_id)
            conn.commit()
    except Exception as exc:  # noqa: BLE001 -- DB errors must also come
        # back as a clean 400 rather than an unhandled 500, matching how
        # routes_detail.py / routes_queue.py never let a raw traceback
        # reach the caller.
        logger.exception("Unhandled error writing baseline for %s", url)
        return _fail(str(exc), 400)

    return jsonify({"status": "success", "price_per_sqm": str(price_per_sqm)})
