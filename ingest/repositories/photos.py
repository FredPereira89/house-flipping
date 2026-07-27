def recorded_source_urls(conn, lead_id: str) -> set[str]:
    """Source URLs already recorded in lead_photos for this lead.

    Kept separate from the on-disk file-exists check in routes_detail so a
    retry after a partial failure can't lose a photo's DB row: the image
    file persists across retries even when the DB transaction that was
    supposed to record it got rolled back, so "file already exists" must
    never be treated as "already recorded in the database".
    """
    rows = conn.execute(
        "SELECT source_url FROM lead_photos WHERE lead_id = %s", (lead_id,)
    ).fetchall()
    return {r["source_url"] for r in rows}


def insert_photo(
    conn, lead_id: str, source_url: str, local_path: str, position: int
) -> None:
    conn.execute(
        "INSERT INTO lead_photos "
        "(id, lead_id, source_url, local_path, position, captured_at, "
        " created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, now(), now(), now())",
        (lead_id, source_url, local_path, position),
    )
