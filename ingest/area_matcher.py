import unicodedata


def normalize_text(s: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace.

    Portal text is inconsistent about accents ("Sao" vs "São"), so all
    matching happens in this normalized space.
    """
    if not s:
        return ""
    decomposed = unicodedata.normalize("NFKD", s)
    stripped = decomposed.encode("ASCII", "ignore").decode("utf-8")
    return " ".join(stripped.lower().split())


def match_area(text: str, areas: list[dict]) -> str | None:
    """Return the area_id whose alias best matches `text`, else None.

    Longest alias wins: "Benfica" is a substring of "São Domingos de
    Benfica", and matching the short one would misfile the lead.
    """
    haystack = normalize_text(text)
    if not haystack:
        return None

    best_id: str | None = None
    best_len = 0
    for area in areas:
        for alias in area.get("aliases", []):
            needle = normalize_text(alias)
            if len(needle) > best_len and needle and needle in haystack:
                best_id = area["id"]
                best_len = len(needle)
    return best_id
