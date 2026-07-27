from psycopg import Connection

def get_pending_jobs(conn: Connection, limit: int = 5) -> list[dict]:
    # Atomically fetch and lock jobs
    rows = conn.execute(
        """
        UPDATE capture_queue
        SET state = 'in_progress', updated_at = now()
        WHERE id IN (
            SELECT id FROM capture_queue
            WHERE state = 'pending'
            ORDER BY enqueued_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, url, kind;
        """,
        (limit,)
    ).fetchall()
    
    return [{"id": r["id"], "url": r["url"], "kind": r["kind"]} for r in rows]

def get_active_searches(conn: Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, portal, url, schedule
        FROM saved_searches
        WHERE enabled = true
        """
    ).fetchall()
    return [{"id": r["id"], "portal": r["portal"], "url": r["url"], "schedule": r["schedule"]} for r in rows]
