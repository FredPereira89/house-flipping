from flask import Blueprint, jsonify
from ingest.auth import require_secret
from ingest.db import connection
from ingest.repositories import queue

bp = Blueprint("queue", __name__)

@bp.route("/ingest/capture-queue", methods=["GET"])
@require_secret
def get_capture_queue():
    with connection() as conn:
        jobs = queue.get_pending_jobs(conn)
        conn.commit()
    return jsonify({"jobs": jobs})

@bp.route("/ingest/searches", methods=["GET"])
@require_secret
def get_searches():
    with connection() as conn:
        searches = queue.get_active_searches(conn)
    return jsonify({"searches": searches})
