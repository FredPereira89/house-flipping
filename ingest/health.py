import logging
import urllib.request
from ingest.config import Config

logger = logging.getLogger("ingest.health")


def ping_deadman(config: Config) -> None:
    """Tell the external monitor this run succeeded (D12).

    Never raises: a monitoring failure must not fail an ingest that
    otherwise worked. Silence is what the monitor alerts on, so a missed
    ping is a false alarm at worst, never lost data.
    """
    if not config.healthcheck_ping_url:
        return
    try:
        urllib.request.urlopen(config.healthcheck_ping_url, timeout=5).close()
    except Exception as exc:
        logger.warning("Dead-man ping failed: %s", exc)
