import hmac
import logging
import os
from functools import wraps
from flask import request, jsonify

logger = logging.getLogger("ingest.auth")

SECRET_HEADER = "X-Ingest-Secret"


def require_secret(fn):
    """Reject requests without the shared secret, and log the rejection.

    Required by build prompt section 6: the ingest service is a separate
    process from the web app, so its endpoints are authenticated.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        expected = os.environ.get("INGEST_SHARED_SECRET", "")
        provided = request.headers.get(SECRET_HEADER, "")
        if not expected or not hmac.compare_digest(expected, provided):
            logger.warning(
                "Rejected %s %s from %s: bad or missing secret",
                request.method,
                request.path,
                request.remote_addr,
            )
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper
