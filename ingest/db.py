from contextlib import contextmanager
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from ingest.config import Config

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        cfg = Config.from_env()
        _pool = ConnectionPool(cfg.database_url, min_size=1, max_size=5, open=True)
    return _pool


@contextmanager
def connection():
    """Yield a pooled connection with dict rows. Commits on clean exit."""
    with get_pool().connection() as conn:
        conn.row_factory = dict_row
        yield conn
