from psycopg import Connection

def get_pending_jobs(conn: Connection, limit: int = 5) -> list[dict]:
    # Atomically fetch and lock jobs
    rows = conn.execute(
        """
        WITH claimed AS (
            SELECT id FROM capture_queue
            WHERE state = 'pending'
            ORDER BY enqueued_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        UPDATE capture_queue q
        SET state = 'in_progress', updated_at = now()
        FROM claimed c
        WHERE q.id = c.id
        RETURNING q.id, q.url, q.kind;
        """,
        (limit,)
    ).fetchall()
    
    return [{"id": r["id"], "url": r["url"], "kind": r["kind"]} for r in rows]

def mark_done(conn: Connection, job_id: str) -> None:
    conn.execute(
        "UPDATE capture_queue SET state = 'done', completed_at = now(), "
        "updated_at = now() WHERE id = %s",
        (job_id,),
    )


def retry_or_fail(conn: Connection, job_id: str, error: str, max_attempts: int) -> None:
    """Record a failed capture attempt and decide whether it gets retried.

    Bumps attempts and last_error unconditionally, then leaves the job
    'pending' (so the next drain retries it) unless this was the
    max_attempts'th failure, in which case it escalates to 'failed' so a
    permanently-broken URL doesn't loop forever. Task 3 amendment: without
    this, any exception mid-capture leaves the row stuck at 'in_progress'
    (set by get_pending_jobs' claim) with nothing to ever revert it.
    """
    conn.execute(
        """
        UPDATE capture_queue
        SET attempts = attempts + 1,
            last_error = %s,
            state = CASE WHEN attempts + 1 >= %s THEN 'failed' ELSE 'pending' END,
            updated_at = now()
        WHERE id = %s
        """,
        (error, max_attempts, job_id),
    )


def get_active_searches(conn: Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, portal, url, schedule
        FROM saved_searches
        WHERE enabled = true
        """
    ).fetchall()
    return [{"id": r["id"], "portal": r["portal"], "url": r["url"], "schedule": r["schedule"]} for r in rows]
