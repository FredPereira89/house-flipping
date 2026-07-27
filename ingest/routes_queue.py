from flask import Blueprint, jsonify
from ingest.auth import require_secret
from ingest.db import connection
from ingest.repositories import queue

bp = Blueprint("queue", __name__)

@bp.route("/ingest/capture-queue", methods=["GET"])
@require_secret
def get_capture_queue():
    # get_pending_jobs() atomically UPDATEs matched rows to 'in_progress'
    # and RETURNS them in the same statement -- so whatever it returns is
    # already claimed, whether or not the caller goes on to process it.
    # background.js's capture loop only ever starts (and awaits) one job at
    # a time, so this must request exactly the number of jobs it will act
    # on this call: limit=1. Requesting more (the previous default of 5)
    # atomically claims rows background.js has no intention of opening a
    # tab for right now, and nothing in this codebase ever reverts a
    # claimed-but-unprocessed row back to 'pending' -- those extra rows
    # would be stranded at 'in_progress' forever, never captured, never
    # retried, never surfaced as an error.
    with connection() as conn:
        jobs = queue.get_pending_jobs(conn, limit=1)
        conn.commit()
    return jsonify({"jobs": jobs})

@bp.route("/ingest/searches", methods=["GET"])
@require_secret
def get_searches():
    with connection() as conn:
        searches = queue.get_active_searches(conn)
    return jsonify({"searches": searches})
