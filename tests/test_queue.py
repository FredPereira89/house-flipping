import pytest
from ingest.repositories.leads import apply_evaluation

def test_queue_enqueue_and_fetch(conn, client, auth_headers, clean_leads):
    # Setup test lead
    lead_id = conn.execute(
        """
        INSERT INTO sourcing_leads (id, org_id, portal, external_id, url, first_seen_at, last_seen_at, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', 'idealista', 'ext1', 'http://url', now(), now(), now())
        RETURNING id
        """
    ).fetchone()["id"]

    apply_evaluation(conn, lead_id, 2000, 20, "hot_lead", None)
    conn.commit()
    
    # Act: fetch queue
    res = client.get("/ingest/capture-queue", headers=auth_headers)
    assert res.status_code == 200
    
    data = res.get_json()
    assert len(data["jobs"]) == 1
    
    job = data["jobs"][0]
    assert job["url"] == 'http://url'
    assert job["kind"] == 'detail'
    
    # Verify it was locked (in_progress)
    row = conn.execute("SELECT state FROM capture_queue WHERE url = 'http://url'").fetchone()
    assert row["state"] == "in_progress"

def test_capture_queue_claims_only_one_job_at_a_time(conn, client, auth_headers, clean_leads):
    """Regression test for a Critical review finding on the self-driving
    extension (Task 2, fix round 2): get_pending_jobs()'s UPDATE ... RETURNING
    atomically flips every row it selects to 'in_progress', whether or not
    the caller goes on to process all of them. background.js's capture loop
    only ever starts one job per tick, so GET /ingest/capture-queue must only
    ever claim one row -- otherwise the rest are stranded at 'in_progress'
    forever (nothing resets them back to 'pending'/'failed')."""
    for i in range(3):
        conn.execute(
            """
            INSERT INTO sourcing_leads
                (id, org_id, portal, external_id, url, first_seen_at, last_seen_at, updated_at)
            VALUES (gen_random_uuid()::text, 'default-org', 'idealista', %s, %s, now(), now(), now())
            """,
            (f"ext{i}", f"http://url{i}"),
        )
        apply_evaluation(
            conn,
            conn.execute(
                "SELECT id FROM sourcing_leads WHERE url = %s", (f"http://url{i}",)
            ).fetchone()["id"],
            2000, 20, "hot_lead", None,
        )
    conn.commit()

    # Sanity check: three hot leads really did enqueue three pending rows.
    pending_before = conn.execute(
        "SELECT count(*) AS n FROM capture_queue WHERE state = 'pending'"
    ).fetchone()["n"]
    assert pending_before == 3

    res = client.get("/ingest/capture-queue", headers=auth_headers)
    assert res.status_code == 200
    data = res.get_json()

    # Exactly one job is handed to the extension...
    assert len(data["jobs"]) == 1

    # ...and the other two are left 'pending' (still claimable on a later
    # tick), not silently flipped to 'in_progress' with no way back.
    states = conn.execute("SELECT state FROM capture_queue ORDER BY enqueued_at").fetchall()
    assert [r["state"] for r in states].count("in_progress") == 1
    assert [r["state"] for r in states].count("pending") == 2

def test_get_searches(conn, client, auth_headers, clean_leads):
    conn.execute(
        """
        INSERT INTO saved_searches (id, org_id, portal, url, enabled, schedule, updated_at)
        VALUES (gen_random_uuid()::text, 'default-org', 'idealista', 'http://search', true, '0 * * * *', now())
        """
    )
    conn.commit()
    
    res = client.get("/ingest/searches", headers=auth_headers)
    assert res.status_code == 200
    
    data = res.get_json()
    assert len(data["searches"]) == 1
    assert data["searches"][0]["url"] == 'http://search'
