from ingest.area_matcher import normalize_text


def load_keywords(conn, org_id: str) -> list[dict]:
    return conn.execute(
        "SELECT keyword, category FROM disqualify_keywords "
        "WHERE org_id = %s AND enabled = true",
        (org_id,),
    ).fetchall()


def check(
    description: str | None, keywords: list[dict]
) -> tuple[bool, str | None, str | None]:
    """Return (is_disqualified, category, matched_keyword).

    Ported from server.py:57-72, with the keyword lists moved out of
    source and into the disqualify_keywords table so they are editable
    without a deploy.
    """
    haystack = normalize_text(description or "")
    if not haystack:
        return False, None, None

    for entry in keywords:
        needle = normalize_text(entry["keyword"])
        if needle and needle in haystack:
            return True, entry["category"], entry["keyword"]
    return False, None, None
