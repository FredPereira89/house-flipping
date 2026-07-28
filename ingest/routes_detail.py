import logging
import os

import requests
from flask import Blueprint, jsonify, request

from ingest.auth import require_secret
from ingest.db import connection
from ingest.parsers import detail_idealista
from ingest.repositories import photos as photos_repo
from ingest.repositories import queue as queue_repo

logger = logging.getLogger("ingest.routes_detail")

bp = Blueprint("detail", __name__)

# requests.get on a portal's CDN must never be allowed to hang the whole
# request indefinitely on a stalled connection (Task 3 amendment).
IMAGE_DOWNLOAD_TIMEOUT_S = 15

# After this many failed attempts at the same capture_queue row, stop
# retrying and escalate to state='failed' instead of looping forever. Not
# load-bearing -- chosen to match this project's existing "5 max fix
# rounds" convention referenced elsewhere in the docs.
MAX_ATTEMPTS = 5


def _capture_photos(conn, lead_id: str, image_urls: list[str]) -> int:
    """Download each detail-page photo once and record any not already in
    lead_photos. Returns how many new lead_photos rows were inserted.

    The on-disk "does the file already exist" check and the DB "is this
    source_url already recorded" check are deliberately independent: if a
    capture fails partway through this loop, the whole DB transaction rolls
    back (see routes_detail's caller) but files already written to disk
    stay there. Treating "file exists" as "already recorded" would mean a
    retry silently skips re-inserting that photo's row forever -- exactly
    the kind of disappearing-without-a-trace failure this project's parsers
    are built to avoid.
    """
    photo_dir = os.path.join("data", "photos", lead_id)
    os.makedirs(photo_dir, exist_ok=True)

    recorded = photos_repo.recorded_source_urls(conn, lead_id)
    inserted = 0

    for idx, img_url in enumerate(image_urls):
        img_path = os.path.join(photo_dir, f"{idx}.jpg")
        if not os.path.exists(img_path):
            r = requests.get(img_url, timeout=IMAGE_DOWNLOAD_TIMEOUT_S)
            if r.status_code == 200:
                with open(img_path, "wb") as f:
                    f.write(r.content)
            else:
                logger.warning(
                    "Image download failed (status %s) for %s", r.status_code, img_url
                )
                continue

        if img_url not in recorded:
            photos_repo.insert_photo(conn, lead_id, img_url, img_path, idx)
            inserted += 1

    return inserted


def _fail(job_id: str, url: str, message: str, status: int, conn=None):
    """Record a capture failure against the capture_queue row for this job_id
    and return the error response. Every path that doesn't reach 'done'
    must go through here -- otherwise the row claimed by get_pending_jobs
    (state='in_progress') is left stuck forever, which is the exact bug the
    Task 3 amendment calls out.
    """
    logger.warning("Detail capture failed for %s: %s", url, message)
    if job_id:
        if conn:
            queue_repo.retry_or_fail(conn, job_id, message, MAX_ATTEMPTS)
        else:
            with connection() as new_conn:
                queue_repo.retry_or_fail(new_conn, job_id, message, MAX_ATTEMPTS)
                new_conn.commit()
    return jsonify({"error": message}), status


@bp.route("/ingest/detail", methods=["POST"])
@require_secret
def ingest_detail():
    body = request.get_json(silent=True) or {}
    url = body.get("url")
    html = body.get("html")
    job_id = body.get("job_id")
    if not url or not html:
        return jsonify({"error": "url and html are required"}), 400

    if "idealista.pt" not in url:
        return _fail(job_id, url, "unsupported portal", 400)

    parsed = detail_idealista.parse_detail(url, html)

    try:
        with connection() as conn:
            if job_id:
                q_row = conn.execute("SELECT org_id FROM capture_queue WHERE id = %s", (job_id,)).fetchone()
                if not q_row:
                    return _fail(job_id, url, "job not found", 404, conn)
                org_id = q_row["org_id"]
            else:
                return _fail(job_id, url, "job_id is required", 400, conn)

            row = conn.execute(
                "SELECT id FROM sourcing_leads WHERE url = %s AND org_id = %s", (url, org_id)
            ).fetchone()
            if not row:
                return _fail(job_id, url, "lead not found", 404, conn)
            lead_id = row["id"]

            downloaded = _capture_photos(conn, lead_id, parsed["image_urls"])

            conn.execute(
                "UPDATE sourcing_leads SET description = %s, updated_at = now() "
                "WHERE id = %s",
                (parsed["description"], lead_id),
            )
            queue_repo.mark_done(conn, job_id)
            conn.commit()
    except Exception as exc:  # noqa: BLE001 -- deliberately broad: any failure
        # here (network hiccup, disk error, DB error) must still retry/fail
        # the queue row rather than let the transaction rollback silently.
        logger.exception("Unhandled error capturing detail page %s", url)
        return _fail(job_id, url, str(exc), 500)

    return jsonify({"status": "success", "downloaded": downloaded})
