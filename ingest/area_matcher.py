import unicodedata

# The 18 municípios of the Área Metropolitana de Lisboa -- this tool's
# actual sourcing/flipping scope. Areas outside AML only exist to supply
# comparison baseline prices (see HANDOFF.md §4d) and were seeded from a
# nationwide administrative dataset whose freguesia names collide with
# AML ones (e.g. "Alvalade" exists in both Lisboa and Santiago do Cacém).
# Portal listing text never states the concelho, so an alias tie can't be
# broken from context -- we break it by preferring the AML area, since
# that's overwhelmingly where real listings for this tool come from.
# Keep in sync with AML_MUNICIPALITIES in
# web/scripts/seed_regional_baseline_areas.js.
AML_MUNICIPALITIES = {
    "Alcochete", "Almada", "Amadora", "Barreiro", "Cascais", "Lisboa",
    "Loures", "Mafra", "Moita", "Montijo", "Odivelas", "Oeiras", "Palmela",
    "Seixal", "Sesimbra", "Setúbal", "Sintra", "Vila Franca de Xira",
}


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
    Benfica", and matching the short one would misfile the lead. On a
    length tie between two areas with the identical freguesia name in
    different concelhos (e.g. "São Sebastião" in both Setúbal and Rio
    Maior), the AML area wins -- see AML_MUNICIPALITIES above.
    """
    haystack = normalize_text(text)
    if not haystack:
        return None

    best_id: str | None = None
    best_len = 0
    best_is_aml = False
    for area in areas:
        is_aml = area.get("municipality") in AML_MUNICIPALITIES
        for alias in area.get("aliases", []):
            needle = normalize_text(alias)
            if not needle or needle not in haystack:
                continue
            if len(needle) > best_len or (
                len(needle) == best_len and is_aml and not best_is_aml
            ):
                best_id = area["id"]
                best_len = len(needle)
                best_is_aml = is_aml
    return best_id
