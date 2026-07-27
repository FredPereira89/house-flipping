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
