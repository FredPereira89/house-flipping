def record_run(
    conn, org_id: str, portal: str | None, url: str, html_bytes: int,
    items_parsed: int, items_new: int, status: str, error: str | None,
    captured_at,
) -> str:
    row = conn.execute(
        "INSERT INTO capture_runs "
        "(id, org_id, portal, url, html_bytes, items_parsed, items_new, "
        " status, error, captured_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
        "        now(), now()) RETURNING id",
        (org_id, portal, url, html_bytes, items_parsed, items_new,
         status, error, captured_at),
    ).fetchone()
    return row["id"]


def raise_alert(
    conn, org_id: str, type_: str, severity: str, message: str,
    entity_type: str | None = None, entity_id: str | None = None,
) -> None:
    conn.execute(
        "INSERT INTO alerts "
        "(id, org_id, type, severity, entity_type, entity_id, message, "
        " created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, now(), now())",
        (org_id, type_, severity, entity_type, entity_id, message),
    )
